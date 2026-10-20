-- Sentate · Fase 3 · 07: límites antiabuso, slugs de demo reservados y reemplazo atómico de horarios.

-- ───────────────────────── Slugs de demo ─────────────────────────
-- /el-bodegon, /la-esquina y /sakura son demos públicas del frontend. Un comercio real no puede
-- tomarlos por el alta (sí pueden existir como fixtures locales cargados por seed.sql).
create or replace function private.is_reserved_demo_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_slug in ('el-bodegon', 'la-esquina', 'sakura');
$$;

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

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sentate:tenant-slug:' || v_slug, 0));

  select t.id into v_tenant_id from public.tenants t where t.slug = v_slug;
  if v_tenant_id is not null then
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

  if private.is_reserved_demo_slug(v_slug) then
    raise exception using errcode = 'P0001', message = 'slug_taken';
  end if;

  begin
    insert into public.tenants (slug, name, timezone) values (v_slug, v_name, v_tz) returning id into v_tenant_id;
  exception when check_violation then
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

-- El slug sigue editable por el dueño, pero no puede pasar a un slug de demo.
create or replace function private.tenants_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_valid_timezone(new.timezone) then
    raise exception using errcode = '22023', message = 'invalid_timezone', detail = new.timezone;
  end if;
  new.slug := pg_catalog.lower(pg_catalog.btrim(new.slug));
  new.name := pg_catalog.btrim(new.name);
  if tg_op = 'UPDATE' and new.slug <> old.slug and private.is_reserved_demo_slug(new.slug) then
    raise exception using errcode = '23505', message = 'slug_taken';
  end if;
  return new;
end;
$$;
grant execute on function private.is_reserved_demo_slug(text) to authenticated;

-- ───────────────────────── Límites antiabuso de solicitudes ─────────────────────────
-- RLS no limita volumen. Estos topes viven en la base para que apliquen aunque alguien llame
-- a la RPC sin pasar por la Server Action. El rate limiting por IP queda en el borde (ver docs).
--  * Máx. 3 solicitudes pendientes futuras por teléfono y comercio  → too_many_pending
--  * Máx. 30 solicitudes nuevas por comercio en 10 minutos          → rate_limited
create index if not exists reservations_tenant_created_idx on public.reservations (tenant_id, created_at desc);

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
  c_max_pending_per_phone constant integer := 3;
  c_max_per_tenant_10min constant integer := 30;
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

  select * into v_tenant from public.tenants t where t.id = p_tenant_id;
  if not found or not v_tenant.is_published or v_tenant.status <> 'active'
     or not private.tenant_has_operational_access(p_tenant_id) then
    raise exception using errcode = 'P0001', message = 'tenant_unavailable';
  end if;

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

  if p_service_date is null or p_time is null then
    raise exception using errcode = 'P0001', message = 'invalid_slot';
  end if;
  v_local_today := (pg_catalog.now() at time zone v_tenant.timezone)::date;
  if p_service_date < v_local_today - 1 or p_service_date > v_local_today + (c_window_days - 1) then
    raise exception using errcode = 'P0001', message = 'date_out_of_range';
  end if;
  if exists (select 1 from public.tenant_closures c where c.tenant_id = p_tenant_id and c.service_date = p_service_date) then
    raise exception using errcode = 'P0001', message = 'tenant_closed';
  end if;

  if extract(second from p_time) <> 0 or extract(minute from p_time)::int % 30 <> 0 then
    raise exception using errcode = 'P0001', message = 'invalid_slot';
  end if;
  v_time_min := (extract(epoch from p_time) / 60)::int;

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

  -- Antiabuso (después de validar, para no dar información con requests basura).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sentate:reservation-tenant:' || p_tenant_id::text, 0));
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

  insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone,
    notes, status, idempotency_key, request_fingerprint)
  values (p_tenant_id, v_starts_at, p_service_date, p_guests, v_name, v_phone, v_notes, 'pending',
    p_idempotency_key, v_fingerprint)
  returning id into v_id;

  return pg_catalog.jsonb_build_object('reservation_id', v_id, 'status', 'pending',
    'service_date', p_service_date, 'starts_at', v_starts_at, 'replayed', false);
end;
$$;

-- ───────────────────────── Reemplazo atómico de horarios ─────────────────────────
-- SECURITY INVOKER: corre con los permisos y RLS del dueño (can_operate). Todo o nada.
-- El panel modela "mismos turnos todos los días abiertos": se expande a una fila por día.
create or replace function public.replace_tenant_schedule(p_tenant_id uuid, p_open_days integer[], p_shifts jsonb)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_day integer;
  v_shift jsonb;
begin
  if not private.can_operate(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_open_days is null or cardinality(p_open_days) > 7
     or exists (select 1 from pg_catalog.unnest(p_open_days) d where d not between 0 and 6) then
    raise exception using errcode = 'P0001', message = 'invalid_days';
  end if;
  if p_shifts is null or pg_catalog.jsonb_typeof(p_shifts) <> 'array' or pg_catalog.jsonb_array_length(p_shifts) > 3 then
    raise exception using errcode = 'P0001', message = 'invalid_shifts';
  end if;

  delete from public.tenant_shifts where tenant_id = p_tenant_id;
  foreach v_day in array coalesce((select array_agg(distinct d) from pg_catalog.unnest(p_open_days) d), '{}'::integer[]) loop
    for v_shift in select * from pg_catalog.jsonb_array_elements(p_shifts) loop
      insert into public.tenant_shifts (tenant_id, weekday, label, opens_at, closes_at)
      values (p_tenant_id, v_day, coalesce(v_shift ->> 'label', ''),
        (v_shift ->> 'open')::time, (v_shift ->> 'close')::time);
    end loop;
  end loop;
end;
$$;
revoke all on function public.replace_tenant_schedule(uuid, integer[], jsonb) from public;
grant execute on function public.replace_tenant_schedule(uuid, integer[], jsonb) to authenticated;

-- ───────────────────────── Acceso del usuario a un comercio ─────────────────────────
-- Para el panel: misma regla que usan las políticas (no se duplica la lógica en la app).
-- SECURITY INVOKER: solo informa sobre la identidad que llama.
create or replace function public.get_tenant_access(p_tenant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'is_member', private.is_tenant_member(p_tenant_id),
    'can_operate', private.can_operate(p_tenant_id)
  );
$$;
revoke all on function public.get_tenant_access(uuid) from public;
grant execute on function public.get_tenant_access(uuid) to authenticated;
