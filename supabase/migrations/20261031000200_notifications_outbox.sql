-- {Sin Nombre} · Mejoras fase 1: base de notificaciones transaccionales (outbox).
--
-- Principios:
--  * Una reserva NUNCA depende del envío: el aviso se encola en una tabla aparte (private.notification_outbox) y el estado de la
--    reserva no cambia si el envío falla.
--  * Solo se avisa a quien lo pidió: el email del comensal se guarda únicamente con consentimiento explícito (notify_consent).
--  * Un aviso se registra como «enviado» solo cuando el proveedor lo confirma (complete_notification).
--  * El despachador no usa claves privilegiadas: se autentica con un secreto cuyo hash está en private.settings.
--  * Idempotente: un mismo aviso (reserva + tipo + canal) se encola una sola vez.

alter table public.reservations add column customer_email text;
alter table public.reservations add column notify_consent boolean not null default false;
alter table public.reservations add constraint reservations_email_format check (
  customer_email is null or (char_length(customer_email) <= 120 and customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
alter table public.reservations add constraint reservations_email_needs_consent check (customer_email is null or notify_consent);
comment on column public.reservations.customer_email is 'Opcional. Solo con consentimiento para avisos de esta solicitud. No se usa para nada más.';

alter table private.settings add column notification_worker_secret_sha256 text;

create table private.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  channel text not null default 'email',
  recipient text not null,
  reservation_id uuid references public.reservations (id) on delete cascade,
  tenant_id uuid references public.tenants (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  constraint outbox_kind check (kind in ('reservation_received', 'reservation_confirmed', 'reservation_rejected', 'reservation_cancelled')),
  constraint outbox_channel check (channel in ('email')),
  constraint outbox_status check (status in ('pending', 'sending', 'sent', 'failed', 'expired')),
  constraint outbox_once unique (reservation_id, kind, channel)
);
create index notification_outbox_due_idx on private.notification_outbox (next_attempt_at) where status = 'pending';
alter table private.notification_outbox enable row level security;
revoke all on table private.notification_outbox from anon, authenticated;

-- Encola avisos al crear la solicitud y al cambiar de estado (solo con email + consentimiento).
create or replace function private.reservations_enqueue_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_tenant public.tenants%rowtype;
begin
  if new.customer_email is null or not new.notify_consent then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_kind := 'reservation_received';
  elsif new.status is distinct from old.status then
    v_kind := case new.status
      when 'confirmed' then 'reservation_confirmed'
      when 'rejected' then 'reservation_rejected'
      -- Solo cancelaciones HECHAS POR EL LOCAL: quien cancela su propia reserva no necesita un aviso de eso.
      when 'cancelled' then case when auth.uid() is distinct from new.user_id or new.user_id is null then 'reservation_cancelled' end
      else null end;
  end if;
  if v_kind is null then
    return new;
  end if;
  select * into v_tenant from public.tenants t where t.id = new.tenant_id;
  insert into private.notification_outbox (kind, recipient, reservation_id, tenant_id, payload)
  values (v_kind, new.customer_email, new.id, new.tenant_id, pg_catalog.jsonb_build_object(
    'tenant_name', v_tenant.name, 'tenant_phone', v_tenant.phone, 'tenant_slug', v_tenant.slug, 'timezone', v_tenant.timezone,
    'starts_at', new.starts_at, 'guests', new.guests, 'first_name', pg_catalog.split_part(pg_catalog.btrim(new.customer_name), ' ', 1)))
  on conflict (reservation_id, kind, channel) do nothing;
  return new;
end;
$$;
revoke all on function private.reservations_enqueue_notification() from public;
create trigger reservations_enqueue_notification after insert or update of status on public.reservations
  for each row execute function private.reservations_enqueue_notification();

-- ───────────────────────── Despachador (sin claves privilegiadas) ─────────────────────────
create or replace function private.notification_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from private.settings s
                 where s.notification_worker_secret_sha256 is not null
                   and s.notification_worker_secret_sha256 = pg_catalog.encode(extensions.digest(p_secret, 'sha256'), 'hex'));
$$;
revoke all on function private.notification_secret_ok(text) from public;

create or replace function private.claim_notifications_impl(p_secret text, p_limit integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if not private.notification_secret_ok(p_secret) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_limit not between 1 and 50 then
    raise exception using errcode = 'P0001', message = 'invalid_limit';
  end if;
  -- Un aviso que lleva más de 24 h sin enviarse ya no es útil: vence en vez de llegar tarde.
  update private.notification_outbox set status = 'expired' where status = 'pending' and created_at < pg_catalog.now() - interval '24 hours';
  -- Un envío trabado (el despachador murió) vuelve a la cola.
  update private.notification_outbox set status = 'pending' where status = 'sending' and claimed_at < pg_catalog.now() - interval '10 minutes';
  with due as (
    select o.id from private.notification_outbox o
    where o.status = 'pending' and o.next_attempt_at <= pg_catalog.now()
    order by o.next_attempt_at
    limit p_limit
    for update skip locked
  ), claimed as (
    update private.notification_outbox o set status = 'sending', attempts = o.attempts + 1, claimed_at = pg_catalog.now()
    from due where o.id = due.id
    returning o.id, o.kind, o.channel, o.recipient, o.payload, o.attempts
  )
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c)) into v_rows from claimed c;
  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

create or replace function private.complete_notification_impl(p_secret text, p_id uuid, p_ok boolean, p_provider_id text, p_error text, p_retryable boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_o private.notification_outbox%rowtype;
  c_max_attempts constant integer := 5;
begin
  if not private.notification_secret_ok(p_secret) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into v_o from private.notification_outbox o where o.id = p_id and o.status = 'sending' for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if p_ok then
    -- «Enviado» solo con la confirmación del proveedor.
    update private.notification_outbox set status = 'sent', sent_at = pg_catalog.now(), provider_message_id = pg_catalog.left(p_provider_id, 120), last_error = null where id = p_id;
  elsif coalesce(p_retryable, false) and v_o.attempts < c_max_attempts then
    update private.notification_outbox
    set status = 'pending', last_error = pg_catalog.left(p_error, 300),
        next_attempt_at = pg_catalog.now() + pg_catalog.make_interval(mins => 5 * v_o.attempts * v_o.attempts)
    where id = p_id;
  else
    update private.notification_outbox set status = 'failed', last_error = pg_catalog.left(p_error, 300) where id = p_id;
  end if;
  return pg_catalog.jsonb_build_object('status', (select status from private.notification_outbox where id = p_id));
end;
$$;

create or replace function public.claim_notifications(p_secret text, p_limit integer default 20)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.claim_notifications_impl(p_secret, p_limit); $$;
create or replace function public.complete_notification(p_secret text, p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null, p_retryable boolean default false)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.complete_notification_impl(p_secret, p_id, p_ok, p_provider_id, p_error, p_retryable); $$;

revoke all on function private.claim_notifications_impl(text, integer) from public;
revoke all on function private.complete_notification_impl(text, uuid, boolean, text, text, boolean) from public;
revoke all on function public.claim_notifications(text, integer) from public;
revoke all on function public.complete_notification(text, uuid, boolean, text, text, boolean) from public;
grant execute on function private.claim_notifications_impl(text, integer) to anon, authenticated;
grant execute on function private.complete_notification_impl(text, uuid, boolean, text, text, boolean) to anon, authenticated;
grant execute on function public.claim_notifications(text, integer) to anon, authenticated;
grant execute on function public.complete_notification(text, uuid, boolean, text, text, boolean) to anon, authenticated;

-- ───────────────────────── Pedido de mesa: email y consentimiento opcionales ─────────────────────────
drop function public.request_reservation(uuid, date, time, integer, text, text, text, uuid);
drop function private.request_reservation_impl(uuid, date, time, integer, text, text, text, uuid);

create or replace function private.request_reservation_impl(
  p_tenant_id uuid,
  p_service_date date,
  p_time time,
  p_guests integer,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_idempotency_key uuid,
  p_customer_email text default null,
  p_notify_consent boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_max_pending_per_phone constant integer := 3;
  c_max_per_tenant_10min constant integer := 30;
  v_name text := pg_catalog.btrim(coalesce(p_customer_name, ''));
  v_phone text := pg_catalog.btrim(coalesce(p_customer_phone, ''));
  v_notes text := pg_catalog.btrim(coalesce(p_notes, ''));
  v_digits text;
  v_fingerprint text;
  v_existing public.reservations%rowtype;
  v_set public.tenant_reservation_settings%rowtype;
  v_chk record;
  v_hold integer;
  v_id uuid;
  v_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_customer_email, ''))), '');
begin
  if p_tenant_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  v_digits := pg_catalog.regexp_replace(v_phone, '[^0-9]', '', 'g');
  v_fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', p_service_date, p_time, p_guests,
    pg_catalog.lower(v_name), v_digits, v_notes));

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sentate:reservation:' || p_tenant_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing from public.reservations r
  where r.tenant_id = p_tenant_id and r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return pg_catalog.jsonb_build_object('reservation_id', v_existing.id, 'status', v_existing.status,
      'service_date', v_existing.service_date, 'starts_at', v_existing.starts_at, 'replayed', true);
  end if;

  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.is_published and t.status = 'active')
     or not private.tenant_has_operational_access(p_tenant_id) then
    raise exception using errcode = 'P0001', message = 'tenant_unavailable';
  end if;

  select * into v_set from public.tenant_reservation_settings s where s.tenant_id = p_tenant_id;
  if found and not v_set.accepts_reservations then
    raise exception using errcode = 'P0001', message = 'reservations_closed';
  end if;
  if p_guests is null or p_guests < 1 or p_guests > coalesce(v_set.max_party_size, 8) then
    raise exception using errcode = 'P0001', message = 'invalid_guests';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  if v_phone !~ '^[0-9 ()+-]+$' or char_length(v_digits) not between 8 and 15 then
    raise exception using errcode = 'P0001', message = 'invalid_phone';
  end if;
  if char_length(v_notes) > 280 then
    raise exception using errcode = 'P0001', message = 'invalid_notes';
  end if;
  -- El email solo se guarda con consentimiento explícito; sin él se descarta (no se avisa, no se conserva).
  if v_email is not null and (v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 120) then
    raise exception using errcode = 'P0001', message = 'invalid_email';
  end if;
  if not coalesce(p_notify_consent, false) then
    v_email := null;
  end if;

  -- Desde acá, todo bajo el bloqueo del comercio: validación de horario + capacidad + escritura son una sola unidad.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sentate:reservation-tenant:' || p_tenant_id::text, 0));
  perform private.expire_stale_reservations(p_tenant_id);

  select * into v_chk from private.reservation_slot_check(p_tenant_id, p_service_date, p_time, p_guests);
  if v_chk.error is not null then
    raise exception using errcode = 'P0001', message = v_chk.error;
  end if;

  if (select count(*) from public.reservations r
      where r.tenant_id = p_tenant_id and r.created_at > pg_catalog.now() - interval '10 minutes'
        and r.idempotency_key is not null) >= c_max_per_tenant_10min then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  if (select count(*) from public.reservations r
      where r.tenant_id = p_tenant_id and r.status = 'pending' and r.starts_at > pg_catalog.now()
        and pg_catalog.regexp_replace(r.customer_phone, '[^0-9]', '', 'g') = v_digits) >= c_max_pending_per_phone then
    raise exception using errcode = 'P0001', message = 'too_many_pending';
  end if;

  v_hold := coalesce(v_set.pending_hold_minutes, 240);
  insert into public.reservations (tenant_id, starts_at, ends_at, service_date, guests, customer_name, customer_phone,
    notes, status, idempotency_key, request_fingerprint, hold_expires_at, customer_email, notify_consent)
  values (p_tenant_id, v_chk.starts_at, v_chk.ends_at, p_service_date, p_guests, v_name, v_phone, v_notes, 'pending',
    p_idempotency_key, v_fingerprint,
    least(pg_catalog.now() + pg_catalog.make_interval(mins => v_hold), v_chk.starts_at), v_email, v_email is not null)
  returning id into v_id;

  return pg_catalog.jsonb_build_object('reservation_id', v_id, 'status', 'pending',
    'service_date', p_service_date, 'starts_at', v_chk.starts_at, 'replayed', false);
end;
$$;


create or replace function public.request_reservation(
  p_tenant_id uuid,
  p_service_date date,
  p_time time,
  p_guests integer,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_idempotency_key uuid,
  p_customer_email text default null,
  p_notify_consent boolean default false
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.request_reservation_impl(p_tenant_id, p_service_date, p_time, p_guests,
    p_customer_name, p_customer_phone, p_notes, p_idempotency_key, p_customer_email, p_notify_consent);
$$;
comment on function public.request_reservation(uuid, date, time, integer, text, text, text, uuid, text, boolean) is
  'Solicitud pública de mesa. Siempre crea en pending. Idempotente por (tenant, p_idempotency_key). Email opcional solo con consentimiento.';
revoke all on function private.request_reservation_impl(uuid, date, time, integer, text, text, text, uuid, text, boolean) from public;
revoke all on function public.request_reservation(uuid, date, time, integer, text, text, text, uuid, text, boolean) from public;
grant execute on function private.request_reservation_impl(uuid, date, time, integer, text, text, text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.request_reservation(uuid, date, time, integer, text, text, text, uuid, text, boolean) to anon, authenticated;
