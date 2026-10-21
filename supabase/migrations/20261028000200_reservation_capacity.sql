-- {Sin Nombre} · Explorador · Etapa E (2/2): capacidad, disponibilidad real y reservas sin sobreventa.
--
-- POLÍTICA (documentada en docs/explorador-diseno.md):
--  * Capacidad = comensales simultáneos (no mesas físicas: no se promete una mesa concreta).
--  * Cada reserva OCUPA [starts_at, ends_at): la ocupación se guarda al crearla, así que cambiar la configuración después
--    NO altera las reservas existentes (nunca se cancela nada solo). Las nuevas reservas ven lo que ya existe.
--  * Una solicitud PENDIENTE retiene cupo hasta que el comercio responde o vence su retención
--    (hold_expires_at = min(creación + pending_hold_minutes, inicio)). Al rechazar, cancelar o vencer, el cupo se libera.
--  * El vencimiento se calcula al leer (hold_expires_at > now()): no depende de ningún cron. Además se marca 'expired'
--    de forma perezosa (al pedir una reserva o abrir el panel).
--  * Todo pedido valida y escribe en UNA transacción con un bloqueo por comercio: dos pedidos concurrentes no pueden
--    consumir el último cupo. La consulta de disponibilidad del navegador es solo informativa; la escritura vuelve a validar.
--  * Capacidad sin configurar (null) = sin tope: el comportamiento anterior; el panel invita a configurarla.

-- ───────────────────────── Configuración por comercio ─────────────────────────
create table public.tenant_reservation_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  accepts_reservations boolean not null default true,
  -- Comensales simultáneos. Null = sin tope configurado.
  capacity_guests integer,
  max_party_size smallint not null default 8,
  slot_interval_minutes smallint not null default 30,
  occupancy_minutes smallint not null default 90,
  min_notice_minutes integer not null default 30,
  -- La última reserva debe empezar al menos tantos minutos antes del cierre del turno (corte de cocina).
  kitchen_cutoff_minutes integer not null default 60,
  pending_hold_minutes integer not null default 240,
  hold_pending boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint trs_capacity check (capacity_guests is null or capacity_guests between 1 and 2000),
  constraint trs_party check (max_party_size between 1 and 50),
  constraint trs_interval check (slot_interval_minutes in (15, 30, 60)),
  constraint trs_occupancy check (occupancy_minutes between 15 and 480),
  constraint trs_notice check (min_notice_minutes between 0 and 10080),
  constraint trs_cutoff check (kitchen_cutoff_minutes between 0 and 480),
  constraint trs_hold check (pending_hold_minutes between 15 and 10080)
);
create trigger tenant_reservation_settings_set_updated_at before update on public.tenant_reservation_settings
  for each row execute function private.set_updated_at();
alter table public.tenant_reservation_settings enable row level security;
revoke all on table public.tenant_reservation_settings from anon, authenticated;
-- Público: solo lo que la carta necesita (sin capacidad ni retención).
grant select (tenant_id, accepts_reservations, max_party_size, slot_interval_minutes) on table public.tenant_reservation_settings to anon;
grant select, insert (tenant_id, accepts_reservations, capacity_guests, max_party_size, slot_interval_minutes, occupancy_minutes,
  min_notice_minutes, kitchen_cutoff_minutes, pending_hold_minutes, hold_pending),
  update (accepts_reservations, capacity_guests, max_party_size, slot_interval_minutes, occupancy_minutes,
  min_notice_minutes, kitchen_cutoff_minutes, pending_hold_minutes, hold_pending)
  on table public.tenant_reservation_settings to authenticated;
grant select, insert, update, delete on table public.tenant_reservation_settings to service_role;
create policy trs_select_anon on public.tenant_reservation_settings
  for select to anon using (private.is_publicly_visible(tenant_id));
create policy trs_select_authenticated on public.tenant_reservation_settings
  for select to authenticated using (private.is_publicly_visible(tenant_id) or private.is_tenant_member(tenant_id));
create policy trs_insert_operator on public.tenant_reservation_settings
  for insert to authenticated with check (private.can_operate(tenant_id));
create policy trs_update_operator on public.tenant_reservation_settings
  for update to authenticated using (private.can_operate(tenant_id)) with check (private.can_operate(tenant_id));

-- Bloqueos de fechas u horarios (además de los cierres por fecha de servicio).
create table public.tenant_reservation_blocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint trb_order check (ends_at > starts_at and ends_at - starts_at <= interval '31 days'),
  constraint trb_reason check (char_length(reason) <= 120)
);
create index trb_tenant_idx on public.tenant_reservation_blocks (tenant_id, starts_at);
alter table public.tenant_reservation_blocks enable row level security;
revoke all on table public.tenant_reservation_blocks from anon, authenticated;
grant select, insert (tenant_id, starts_at, ends_at, reason), update (starts_at, ends_at, reason), delete
  on table public.tenant_reservation_blocks to authenticated;
grant select, insert, update, delete on table public.tenant_reservation_blocks to service_role;
create policy trb_select on public.tenant_reservation_blocks for select to authenticated using (private.is_tenant_member(tenant_id));
create policy trb_insert on public.tenant_reservation_blocks for insert to authenticated with check (private.can_operate(tenant_id));
create policy trb_update on public.tenant_reservation_blocks for update to authenticated
  using (private.can_operate(tenant_id)) with check (private.can_operate(tenant_id));
create policy trb_delete on public.tenant_reservation_blocks for delete to authenticated using (private.can_operate(tenant_id));

-- ───────────────────────── Ocupación de cada reserva ─────────────────────────
alter table public.reservations add column ends_at timestamptz;
alter table public.reservations add column hold_expires_at timestamptz;
update public.reservations set ends_at = starts_at + interval '90 minutes' where ends_at is null;
update public.reservations set hold_expires_at = starts_at where status = 'pending' and hold_expires_at is null;
alter table public.reservations alter column ends_at set not null;
-- Inserciones que no informan la ocupación (fixtures, soporte) reciben la duración por defecto de 90 minutos.
create or replace function private.reservations_default_window()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ends_at is null then
    new.ends_at := new.starts_at + interval '90 minutes';
  end if;
  return new;
end;
$$;
create trigger reservations_default_window before insert on public.reservations
  for each row execute function private.reservations_default_window();
alter table public.reservations add constraint reservations_ends_after_start check (ends_at > starts_at);
-- Consulta de capacidad: reservas del comercio que se solapan con una ventana.
create index reservations_tenant_window_idx on public.reservations (tenant_id, starts_at, ends_at)
  where status in ('pending', 'confirmed');

-- ───────────────────────── Capacidad (núcleo, bajo bloqueo del llamador) ─────────────────────────
-- ¿Entran p_guests comensales durante [p_start, p_end)? La carga máxima se evalúa en el inicio de la ventana y en cada
-- inicio de otra reserva que cae adentro (la carga solo sube en esos puntos).
create or replace function private.reservation_capacity_ok(
  p_tenant_id uuid, p_start timestamptz, p_end timestamptz, p_guests integer, p_exclude uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cap integer;
  v_hold boolean;
  v_peak integer;
begin
  select s.capacity_guests, s.hold_pending into v_cap, v_hold
  from public.tenant_reservation_settings s where s.tenant_id = p_tenant_id;
  if v_cap is null then
    return true;
  end if;
  v_hold := coalesce(v_hold, true);
  if p_guests > v_cap then
    return false;
  end if;
  with occ as (
    select r.starts_at as s, r.ends_at as e, r.guests
    from public.reservations r
    where r.tenant_id = p_tenant_id
      and r.id is distinct from p_exclude
      and r.starts_at < p_end and r.ends_at > p_start
      and (r.status = 'confirmed'
           or (r.status = 'pending' and v_hold and coalesce(r.hold_expires_at, r.starts_at) > pg_catalog.now()))
  ),
  pts as (
    select p_start as t
    union
    select o.s from occ o where o.s > p_start
  )
  select coalesce(max(load), 0) into v_peak
  from (
    select (select coalesce(sum(o.guests), 0) from occ o where o.s <= pts.t and o.e > pts.t) as load from pts
  ) x;
  return v_peak + p_guests <= v_cap;
end;
$$;
revoke all on function private.reservation_capacity_ok(uuid, timestamptz, timestamptz, integer, uuid) from public;
grant execute on function private.reservation_capacity_ok(uuid, timestamptz, timestamptz, integer, uuid) to authenticated;

-- ───────────────────────── Validación de un horario concreto ─────────────────────────
-- Devuelve el código de error estable (o null si el horario es reservable) y los datos del turno.
create or replace function private.reservation_slot_check(
  p_tenant_id uuid, p_service_date date, p_time time, p_guests integer)
returns table (error text, starts_at timestamptz, ends_at timestamptz, shift_label text, shift_opens time, shift_closes time,
               after_midnight boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_set public.tenant_reservation_settings%rowtype;
  v_interval integer;
  v_occupancy integer;
  v_cutoff integer;
  v_notice integer;
  v_max_party integer;
  v_today date;
  v_time_min integer;
  v_offset integer;
  v_shift_shift integer;
  v_label text;
  v_opens time;
  v_closes time;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_tenant from public.tenants t where t.id = p_tenant_id;
  if not found or not v_tenant.is_published or v_tenant.status <> 'active'
     or not private.tenant_has_operational_access(p_tenant_id) then
    return query select 'tenant_unavailable'::text, null::timestamptz, null::timestamptz, null::text, null::time, null::time, null::boolean;
    return;
  end if;
  select * into v_set from public.tenant_reservation_settings s where s.tenant_id = p_tenant_id;
  if found and not v_set.accepts_reservations then
    return query select 'reservations_closed'::text, null::timestamptz, null::timestamptz, null::text, null::time, null::time, null::boolean;
    return;
  end if;
  v_interval := coalesce(v_set.slot_interval_minutes, 30);
  v_occupancy := coalesce(v_set.occupancy_minutes, 90);
  v_cutoff := coalesce(v_set.kitchen_cutoff_minutes, 60);
  v_notice := coalesce(v_set.min_notice_minutes, 30);
  v_max_party := coalesce(v_set.max_party_size, 8);

  if p_guests is null or p_guests < 1 or p_guests > v_max_party then
    return query select 'invalid_guests'::text, null::timestamptz, null::timestamptz, null::text, null::time, null::time, null::boolean;
    return;
  end if;
  if p_service_date is null or p_time is null then
    return query select 'invalid_slot'::text, null::timestamptz, null::timestamptz, null::text, null::time, null::time, null::boolean;
    return;
  end if;
  v_today := (pg_catalog.now() at time zone v_tenant.timezone)::date;
  if p_service_date < v_today - 1 or p_service_date > v_today + 13 then
    return query select 'date_out_of_range'::text, null::timestamptz, null::timestamptz, null::text, null::time, null::time, null::boolean;
    return;
  end if;
  if exists (select 1 from public.tenant_closures c where c.tenant_id = p_tenant_id and c.service_date = p_service_date) then
    return query select 'tenant_closed'::text, null::timestamptz, null::timestamptz, null::text, null::time, null::time, null::boolean;
    return;
  end if;
  if extract(second from p_time) <> 0 or (extract(hour from p_time)::int * 60 + extract(minute from p_time)::int) % v_interval <> 0 then
    return query select 'invalid_slot'::text, null::timestamptz, null::timestamptz, null::text, null::time, null::time, null::boolean;
    return;
  end if;
  v_time_min := (extract(epoch from p_time) / 60)::int;

  select o.offset_min, ((extract(epoch from s.opens_at) / 60)::int + o.offset_min) / 1440, s.label, s.opens_at, s.closes_at
    into v_offset, v_shift_shift, v_label, v_opens, v_closes
  from public.tenant_shifts s
  cross join lateral (
    select ((v_time_min - (extract(epoch from s.opens_at) / 60)::int) % 1440 + 1440) % 1440 as offset_min
  ) o
  where s.tenant_id = p_tenant_id
    and s.weekday = extract(dow from p_service_date)::int
    and o.offset_min <= private.shift_minutes(s.opens_at, s.closes_at) - v_cutoff
  order by s.opens_at
  limit 1;
  if v_offset is null then
    return query select 'outside_opening_hours'::text, null::timestamptz, null::timestamptz, null::text, null::time, null::time, null::boolean;
    return;
  end if;

  v_start := ((p_service_date + v_shift_shift) + p_time) at time zone v_tenant.timezone;
  v_end := v_start + pg_catalog.make_interval(mins => v_occupancy);
  if v_start < pg_catalog.now() + pg_catalog.make_interval(mins => v_notice) then
    return query select 'slot_too_soon'::text, v_start, v_end, v_label, v_opens, v_closes, v_shift_shift > 0;
    return;
  end if;
  if exists (select 1 from public.tenant_reservation_blocks b
             where b.tenant_id = p_tenant_id and b.starts_at < v_end and b.ends_at > v_start) then
    return query select 'slot_blocked'::text, v_start, v_end, v_label, v_opens, v_closes, v_shift_shift > 0;
    return;
  end if;
  if not private.reservation_capacity_ok(p_tenant_id, v_start, v_end, p_guests) then
    return query select 'slot_full'::text, v_start, v_end, v_label, v_opens, v_closes, v_shift_shift > 0;
    return;
  end if;
  return query select null::text, v_start, v_end, v_label, v_opens, v_closes, v_shift_shift > 0;
end;
$$;
revoke all on function private.reservation_slot_check(uuid, date, time, integer) from public;

-- ───────────────────────── Disponibilidad (informativa) ─────────────────────────
create or replace function private.reservation_availability_impl(p_tenant_id uuid, p_service_date date, p_guests integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_set public.tenant_reservation_settings%rowtype;
  v_interval integer;
  v_cutoff integer;
  v_first record;
  v_slots jsonb := '[]'::jsonb;
  v_shift record;
  v_off integer;
  v_t time;
  v_chk record;
begin
  select t.timezone into v_tz from public.tenants t where t.id = p_tenant_id;
  select * into v_set from public.tenant_reservation_settings s where s.tenant_id = p_tenant_id;
  v_interval := coalesce(v_set.slot_interval_minutes, 30);
  v_cutoff := coalesce(v_set.kitchen_cutoff_minutes, 60);

  -- Error de fecha/local (cerrado, fuera de rango, sin acceso): no hay horarios.
  select * into v_first from private.reservation_slot_check(p_tenant_id, p_service_date, time '00:00', p_guests);
  if v_first.error in ('tenant_unavailable', 'reservations_closed', 'invalid_guests', 'date_out_of_range', 'tenant_closed') then
    return pg_catalog.jsonb_build_object('closed_reason', v_first.error, 'slots', '[]'::jsonb);
  end if;

  for v_shift in
    select s.label, s.opens_at, s.closes_at
    from public.tenant_shifts s
    where s.tenant_id = p_tenant_id and s.weekday = extract(dow from p_service_date)::int
    order by s.opens_at
  loop
    for v_off in 0 .. (private.shift_minutes(v_shift.opens_at, v_shift.closes_at) - v_cutoff) loop
      if (((extract(epoch from v_shift.opens_at) / 60)::int + v_off) % 1440) % v_interval <> 0 then
        continue;
      end if;
      v_t := (((extract(epoch from v_shift.opens_at) / 60)::int + v_off) % 1440) * interval '1 minute' + time '00:00';
      select * into v_chk from private.reservation_slot_check(p_tenant_id, p_service_date, v_t, p_guests);
      if v_chk.error is null or v_chk.error in ('slot_full', 'slot_blocked', 'slot_too_soon') then
        v_slots := v_slots || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'time', pg_catalog.to_char(v_t, 'HH24:MI'), 'starts_at', v_chk.starts_at,
          'shift_label', v_shift.label, 'shift_opens', pg_catalog.to_char(v_shift.opens_at, 'HH24:MI'),
          'shift_closes', pg_catalog.to_char(v_shift.closes_at, 'HH24:MI'),
          'after_midnight', coalesce(v_chk.after_midnight, false),
          'available', v_chk.error is null, 'reason', v_chk.error));
      end if;
    end loop;
  end loop;
  return pg_catalog.jsonb_build_object('closed_reason', null, 'interval', v_interval, 'slots', v_slots);
end;
$$;

create or replace function public.reservation_availability(p_tenant_id uuid, p_service_date date, p_guests integer)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.reservation_availability_impl(p_tenant_id, p_service_date, p_guests); $$;
revoke all on function private.reservation_availability_impl(uuid, date, integer) from public;
revoke all on function public.reservation_availability(uuid, date, integer) from public;
grant execute on function private.reservation_availability_impl(uuid, date, integer) to anon, authenticated;
grant execute on function public.reservation_availability(uuid, date, integer) to anon, authenticated;

-- ───────────────────────── Vencimiento perezoso de pendientes ─────────────────────────
create or replace function private.expire_stale_reservations(p_tenant_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.reservations r set status = 'expired'
  where r.tenant_id = p_tenant_id and r.status = 'pending' and coalesce(r.hold_expires_at, r.starts_at) <= pg_catalog.now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.expire_stale_reservations(uuid) from public;

create or replace function private.expire_my_stale_reservations_impl(p_tenant_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_tenant_member(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return private.expire_stale_reservations(p_tenant_id);
end;
$$;
create or replace function public.expire_stale_reservations(p_tenant_id uuid)
returns integer language sql volatile security invoker set search_path = ''
as $$ select private.expire_my_stale_reservations_impl(p_tenant_id); $$;
revoke all on function private.expire_my_stale_reservations_impl(uuid) from public;
revoke all on function public.expire_stale_reservations(uuid) from public;
grant execute on function private.expire_my_stale_reservations_impl(uuid) to authenticated;
grant execute on function public.expire_stale_reservations(uuid) to authenticated;

-- ───────────────────────── Transiciones y revalidación al confirmar ─────────────────────────
create or replace function private.reservations_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id <> old.tenant_id or new.starts_at <> old.starts_at or new.service_date <> old.service_date
     or new.ends_at <> old.ends_at
     or new.idempotency_key is distinct from old.idempotency_key
     or new.request_fingerprint is distinct from old.request_fingerprint
     or new.created_at <> old.created_at
     or (new.user_id is distinct from old.user_id and new.user_id is not null) then
    raise exception using errcode = '42501', message = 'reservation_immutable_field';
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'rejected', 'cancelled', 'expired'))
      or (old.status = 'confirmed' and new.status in ('cancelled', 'finished'))
    ) then
      raise exception using errcode = '23514', message = 'invalid_status_transition',
        detail = format('%s -> %s', old.status, new.status);
    end if;
    -- 'expired' lo marca solo el sistema (vencimiento de la retención), no un cliente.
    if new.status = 'expired' and current_user in ('anon', 'authenticated') then
      raise exception using errcode = '23514', message = 'invalid_status_transition',
        detail = format('%s -> %s', old.status, new.status);
    end if;
    if new.status = 'finished' and old.starts_at > pg_catalog.now() then
      raise exception using errcode = '23514', message = 'invalid_status_transition',
        detail = 'finish_before_start';
    end if;
    -- Confirmar una solicitud cuya retención ya venció equivale a un pedido nuevo: se revalida el cupo.
    if new.status = 'confirmed' and coalesce(old.hold_expires_at, old.starts_at) <= pg_catalog.now() then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sentate:reservation-tenant:' || old.tenant_id::text, 0));
      if not private.reservation_capacity_ok(old.tenant_id, old.starts_at, old.ends_at, old.guests::integer, old.id) then
        raise exception using errcode = '23514', message = 'capacity_exceeded';
      end if;
    end if;
    new.decided_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

-- ───────────────────────── Pedido de mesa (reescrito con capacidad) ─────────────────────────
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
    notes, status, idempotency_key, request_fingerprint, hold_expires_at)
  values (p_tenant_id, v_chk.starts_at, v_chk.ends_at, p_service_date, p_guests, v_name, v_phone, v_notes, 'pending',
    p_idempotency_key, v_fingerprint,
    least(pg_catalog.now() + pg_catalog.make_interval(mins => v_hold), v_chk.starts_at))
  returning id into v_id;

  return pg_catalog.jsonb_build_object('reservation_id', v_id, 'status', 'pending',
    'service_date', p_service_date, 'starts_at', v_chk.starts_at, 'replayed', false);
end;
$$;

-- ───────────────────────── Historial del comensal: estados según la ocupación real ─────────────────────────
create or replace function private.my_reservations_impl(p_id uuid, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'invalid_filter';
  end if;
  return pg_catalog.jsonb_build_object(
    'total', (select count(*) from public.reservations r where r.user_id = v_uid and (p_id is null or r.id = p_id)),
    'items', coalesce((
      select pg_catalog.jsonb_agg(x.item order by x.starts_at desc)
      from (
        select r.starts_at,
               pg_catalog.jsonb_build_object(
                 'id', r.id, 'status', r.status,
                 'display_status', case
                    when r.status = 'confirmed' and r.ends_at < pg_catalog.now() then 'finished'
                    when r.status = 'pending' and coalesce(r.hold_expires_at, r.starts_at) <= pg_catalog.now() then 'expired'
                    else r.status::text end,
                 'starts_at', r.starts_at, 'service_date', r.service_date, 'guests', r.guests, 'notes', r.notes,
                 'created_at', r.created_at, 'decided_at', r.decided_at,
                 'can_cancel', (r.status in ('pending', 'confirmed') and r.starts_at > pg_catalog.now()
                                and (r.status = 'pending'
                                     or r.starts_at - pg_catalog.make_interval(hours => t.diner_cancel_cutoff_hours) > pg_catalog.now())),
                 'cancel_cutoff_hours', t.diner_cancel_cutoff_hours,
                 'tenant', pg_catalog.jsonb_build_object('slug', t.slug, 'name', t.name, 'address', t.address, 'phone', t.phone,
                                                          'timezone', t.timezone, 'visible', private.is_publicly_visible(t.id))
               ) as item
        from public.reservations r
        join public.tenants t on t.id = r.tenant_id
        where r.user_id = v_uid and (p_id is null or r.id = p_id)
        order by r.starts_at desc
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb));
end;
$$;

-- ───────────────────────── Guardado de la configuración ─────────────────────────
-- SECURITY INVOKER: corre con RLS/grants del dueño (can_operate). Claves ausentes = sin cambios.
create or replace function public.save_reservation_settings(p_tenant_id uuid, p_settings jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v public.tenant_reservation_settings%rowtype;
begin
  if not private.can_operate(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  insert into public.tenant_reservation_settings as s (tenant_id) values (p_tenant_id) on conflict (tenant_id) do nothing;
  update public.tenant_reservation_settings s set
    accepts_reservations = coalesce((p_settings ->> 'accepts_reservations')::boolean, s.accepts_reservations),
    capacity_guests = case when pg_catalog.jsonb_exists(p_settings, 'capacity_guests') then (p_settings ->> 'capacity_guests')::integer else s.capacity_guests end,
    max_party_size = coalesce((p_settings ->> 'max_party_size')::smallint, s.max_party_size),
    slot_interval_minutes = coalesce((p_settings ->> 'slot_interval_minutes')::smallint, s.slot_interval_minutes),
    occupancy_minutes = coalesce((p_settings ->> 'occupancy_minutes')::smallint, s.occupancy_minutes),
    min_notice_minutes = coalesce((p_settings ->> 'min_notice_minutes')::integer, s.min_notice_minutes),
    kitchen_cutoff_minutes = coalesce((p_settings ->> 'kitchen_cutoff_minutes')::integer, s.kitchen_cutoff_minutes),
    pending_hold_minutes = coalesce((p_settings ->> 'pending_hold_minutes')::integer, s.pending_hold_minutes),
    hold_pending = coalesce((p_settings ->> 'hold_pending')::boolean, s.hold_pending)
  where s.tenant_id = p_tenant_id
  returning * into v;
  return pg_catalog.to_jsonb(v);
end;
$$;
revoke all on function public.save_reservation_settings(uuid, jsonb) from public;
grant execute on function public.save_reservation_settings(uuid, jsonb) to authenticated;

-- Bloqueo por fecha y horas LOCALES del comercio (si "hasta" es menor o igual que "desde", cruza la medianoche).
create or replace function public.add_reservation_block(p_tenant_id uuid, p_date date, p_from time, p_to time, p_reason text default '')
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
begin
  if not private.can_operate(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select t.timezone into v_tz from public.tenants t where t.id = p_tenant_id;
  v_start := (p_date + p_from) at time zone v_tz;
  v_end := (p_date + case when p_to <= p_from then 1 else 0 end + p_to) at time zone v_tz;
  insert into public.tenant_reservation_blocks (tenant_id, starts_at, ends_at, reason)
  values (p_tenant_id, v_start, v_end, pg_catalog.btrim(coalesce(p_reason, '')))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_reservation_block(uuid, date, time, time, text) from public;
grant execute on function public.add_reservation_block(uuid, date, time, time, text) to authenticated;
