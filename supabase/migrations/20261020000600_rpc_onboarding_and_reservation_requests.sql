-- Sentate · Fase 2 · 06: operaciones controladas (alta de comercio y solicitud pública de reserva).
--
-- Patrón: implementación SECURITY DEFINER en `private` (no expuesto) + envoltorio
-- SECURITY INVOKER en `public` (lo único invocable por la Data API / futura Server Action).
-- Errores de negocio: SQLSTATE P0001 con un código estable en MESSAGE (ver docs).

-- ───────────────────────── Alta del comercio ─────────────────────────
-- DEFINER justificado: debe crear membresía y suscripción, tablas sin privilegios de escritura
-- para clientes. El dueño SIEMPRE es auth.uid(); no se aceptan owner_id, estado ni fechas.
create or replace function private.create_tenant_impl(p_slug text, p_name text, p_timezone text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_slug text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_slug, '')));
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_tz text := coalesce(nullif(pg_catalog.btrim(p_timezone), ''), 'America/Argentina/Buenos_Aires');
  v_trial_days integer;
  v_tenant_id uuid;
  v_trial_ends_at timestamptz;
begin
  if v_uid is null or not exists (select 1 from auth.users u where u.id = v_uid) then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$' or v_slug ~ '--' then
    raise exception using errcode = 'P0001', message = 'invalid_slug';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  if not private.is_valid_timezone(v_tz) then
    raise exception using errcode = 'P0001', message = 'invalid_timezone';
  end if;

  -- Serializa altas del mismo slug para que reintentos concurrentes no choquen.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sentate:tenant-slug:' || v_slug, 0));

  select t.id into v_tenant_id from public.tenants t where t.slug = v_slug;
  if v_tenant_id is not null then
    -- Reintento idempotente: el mismo usuario ya es owner de ese slug → mismo resultado.
    if exists (
      select 1 from public.tenant_members m
      where m.tenant_id = v_tenant_id and m.user_id = v_uid and m.role = 'owner'
    ) then
      select s.trial_ends_at into v_trial_ends_at from public.tenant_subscriptions s where s.tenant_id = v_tenant_id;
      return pg_catalog.jsonb_build_object('tenant_id', v_tenant_id, 'slug', v_slug, 'created', false,
        'trial_ends_at', v_trial_ends_at);
    end if;
    raise exception using errcode = 'P0001', message = 'slug_taken';
  end if;

  begin
    insert into public.tenants (slug, name, timezone) values (v_slug, v_name, v_tz) returning id into v_tenant_id;
  exception when check_violation then
    -- p.ej. slug reservado
    raise exception using errcode = 'P0001', message = 'invalid_slug';
  end;

  insert into public.tenant_members (tenant_id, user_id, role) values (v_tenant_id, v_uid, 'owner');

  select c.trial_days into v_trial_days from private.plan_config c;
  insert into public.tenant_subscriptions (tenant_id, status, trial_started_at, trial_ends_at)
  values (v_tenant_id, 'trialing', pg_catalog.now(), pg_catalog.now() + pg_catalog.make_interval(days => v_trial_days))
  returning trial_ends_at into v_trial_ends_at;

  return pg_catalog.jsonb_build_object('tenant_id', v_tenant_id, 'slug', v_slug, 'created', true,
    'trial_ends_at', v_trial_ends_at);
end;
$$;

create or replace function public.create_tenant(p_slug text, p_name text, p_timezone text default null)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_tenant_impl(p_slug, p_name, p_timezone);
$$;
comment on function public.create_tenant(text, text, text) is
  'Alta atómica: tenant + membresía owner (auth.uid()) + prueba de 30 días. Reintento con el mismo slug y usuario devuelve el existente.';

revoke all on function private.create_tenant_impl(text, text, text) from public;
revoke all on function public.create_tenant(text, text, text) from public;
grant execute on function private.create_tenant_impl(text, text, text) to authenticated;
grant execute on function public.create_tenant(text, text, text) to authenticated;

-- ───────────────────────── Solicitud pública de reserva ─────────────────────────
-- DEFINER justificado: anon no tiene ningún privilegio sobre reservations (ni SELECT ni INSERT).
-- La función valida todo, fuerza 'pending' y devuelve solo datos de ESTA solicitud.
-- No reemplaza rate limiting: ver docs (Fase 3).
create or replace function private.request_reservation_impl(
  p_tenant_id uuid,
  p_service_date date,
  p_time time,
  p_guests integer,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_max_guests constant integer := 8;
  c_lead_minutes constant integer := 30;
  c_window_days constant integer := 14;
  c_last_seating constant integer := 60;
  v_name text := pg_catalog.btrim(coalesce(p_customer_name, ''));
  v_phone text := pg_catalog.btrim(coalesce(p_customer_phone, ''));
  v_notes text := pg_catalog.btrim(coalesce(p_notes, ''));
  v_digits text;
  v_fingerprint text;
  v_existing public.reservations%rowtype;
  v_tenant public.tenants%rowtype;
  v_local_today date;
  v_time_min integer;
  v_offset integer;
  v_calendar_shift integer;
  v_starts_at timestamptz;
  v_id uuid;
begin
  if p_tenant_id is null or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  v_digits := pg_catalog.regexp_replace(v_phone, '[^0-9]', '', 'g');
  v_fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', p_service_date, p_time, p_guests,
    pg_catalog.lower(v_name), v_digits, v_notes));

  -- Idempotencia: serializa la misma clave y devuelve la solicitud ya creada.
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

  -- Comercio: publicado, activo y con acceso operativo vigente (prueba/suscripción calculada ahora).
  select * into v_tenant from public.tenants t where t.id = p_tenant_id;
  if not found or not v_tenant.is_published or v_tenant.status <> 'active'
     or not private.tenant_has_operational_access(p_tenant_id) then
    raise exception using errcode = 'P0001', message = 'tenant_unavailable';
  end if;

  -- Datos del comensal.
  if p_guests is null or p_guests < 1 or p_guests > c_max_guests then
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

  -- Fecha de servicio dentro de la ventana, en la zona del comercio.
  if p_service_date is null or p_time is null then
    raise exception using errcode = 'P0001', message = 'invalid_slot';
  end if;
  v_local_today := (pg_catalog.now() at time zone v_tenant.timezone)::date;
  -- -1: el turno de anoche que todavía sigue abierto (madrugada).
  if p_service_date < v_local_today - 1 or p_service_date > v_local_today + (c_window_days - 1) then
    raise exception using errcode = 'P0001', message = 'date_out_of_range';
  end if;
  if exists (select 1 from public.tenant_closures c where c.tenant_id = p_tenant_id and c.service_date = p_service_date) then
    raise exception using errcode = 'P0001', message = 'tenant_closed';
  end if;

  -- Horarios cada 30 minutos.
  if extract(second from p_time) <> 0 or extract(minute from p_time)::int % 30 <> 0 then
    raise exception using errcode = 'P0001', message = 'invalid_slot';
  end if;
  v_time_min := (extract(epoch from p_time) / 60)::int;

  -- Turno que abre en el día de la semana de la FECHA DE SERVICIO y contiene el horario
  -- (hasta 1 h antes del cierre). Si el horario cae después de medianoche, la fecha
  -- calendario es la siguiente, pero la fecha de servicio no cambia.
  select o.offset_min, ((extract(epoch from s.opens_at) / 60)::int + o.offset_min) / 1440
    into v_offset, v_calendar_shift
  from public.tenant_shifts s
  cross join lateral (
    select ((v_time_min - (extract(epoch from s.opens_at) / 60)::int) % 1440 + 1440) % 1440 as offset_min
  ) o
  where s.tenant_id = p_tenant_id
    and s.weekday = extract(dow from p_service_date)::int
    and o.offset_min <= private.shift_minutes(s.opens_at, s.closes_at) - c_last_seating
  order by s.opens_at
  limit 1;
  if v_offset is null then
    raise exception using errcode = 'P0001', message = 'outside_opening_hours';
  end if;

  v_starts_at := ((p_service_date + v_calendar_shift) + p_time) at time zone v_tenant.timezone;
  if v_starts_at < pg_catalog.now() + pg_catalog.make_interval(mins => c_lead_minutes) then
    raise exception using errcode = 'P0001', message = 'slot_too_soon';
  end if;

  insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone,
    notes, status, idempotency_key, request_fingerprint)
  values (p_tenant_id, v_starts_at, p_service_date, p_guests, v_name, v_phone, v_notes, 'pending',
    p_idempotency_key, v_fingerprint)
  returning id into v_id;

  return pg_catalog.jsonb_build_object('reservation_id', v_id, 'status', 'pending',
    'service_date', p_service_date, 'starts_at', v_starts_at, 'replayed', false);
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
  p_idempotency_key uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.request_reservation_impl(p_tenant_id, p_service_date, p_time, p_guests,
    p_customer_name, p_customer_phone, p_notes, p_idempotency_key);
$$;
comment on function public.request_reservation(uuid, date, time, integer, text, text, text, uuid) is
  'Solicitud pública de mesa. Siempre crea en pending. Idempotente por (tenant, p_idempotency_key). Respuesta mínima.';

revoke all on function private.request_reservation_impl(uuid, date, time, integer, text, text, text, uuid) from public;
revoke all on function public.request_reservation(uuid, date, time, integer, text, text, text, uuid) from public;
grant execute on function private.request_reservation_impl(uuid, date, time, integer, text, text, text, uuid)
  to anon, authenticated;
grant execute on function public.request_reservation(uuid, date, time, integer, text, text, text, uuid)
  to anon, authenticated;
