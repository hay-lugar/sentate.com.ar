-- Auditoría de seguridad (run-1): endurecimientos aditivos, sin tocar datos.
--  1) Capacidad y retención de reservas solo para quien opera el local (antes las leía cualquier cuenta).
--  2) Un local rechazado en moderación no recibe solicitudes de reserva.
--  3) Tope de avisos por destinatario (el correo lo escribe un anónimo y no se verifica).
--  4) Cambiar provincia/localidad/barrio de un local aprobado lo devuelve a revisión.

-- 1) ───────── tenant_reservation_settings ─────────
revoke select on table public.tenant_reservation_settings from authenticated;
grant select (tenant_id, accepts_reservations, max_party_size, slot_interval_minutes)
  on table public.tenant_reservation_settings to authenticated;

-- El upsert del panel leía columnas privadas con los permisos de quien llama: pasa a DEFINER con la misma compuerta.
create or replace function public.save_reservation_settings(p_tenant_id uuid, p_settings jsonb)
returns jsonb
language plpgsql
volatile
security definer
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

-- Lectura completa para el panel (miembros del local).
create or replace function public.get_reservation_settings(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.tenant_reservation_settings%rowtype;
begin
  if not private.is_tenant_member(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into v from public.tenant_reservation_settings s where s.tenant_id = p_tenant_id;
  if not found then
    return null;
  end if;
  return pg_catalog.to_jsonb(v);
end;
$$;
revoke all on function public.get_reservation_settings(uuid) from public;
grant execute on function public.get_reservation_settings(uuid) to authenticated;

-- 2) ───────── local rechazado no recibe solicitudes ─────────
create or replace function private.reservations_block_rejected()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.tenant_moderation m where m.tenant_id = new.tenant_id and m.status = 'rejected') then
    raise exception using errcode = 'P0001', message = 'tenant_unavailable';
  end if;
  return new;
end;
$$;
revoke all on function private.reservations_block_rejected() from public;
create trigger reservations_block_rejected before insert on public.reservations
  for each row execute function private.reservations_block_rejected();

-- 3) ───────── tope de avisos por destinatario ─────────
-- Si ya se le mandaron muchos avisos a esa dirección en un día, no se encolan más (la reserva igual se guarda).
create or replace function private.reservations_enqueue_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_tenant public.tenants%rowtype;
  c_max_per_recipient_day constant integer := 6;
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
      when 'expired' then 'reservation_expired'
      when 'cancelled' then case when auth.uid() is distinct from new.user_id or new.user_id is null then 'reservation_cancelled' end
      else null end;
  end if;
  if v_kind is null then
    return new;
  end if;
  if (select count(*) from private.notification_outbox o
      where o.recipient = new.customer_email and o.created_at > pg_catalog.now() - interval '24 hours') >= c_max_per_recipient_day then
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

-- 4) ───────── cambios de zona vuelven a revisión ─────────
create or replace function private.tenant_locations_material_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if extensions.st_distance(old.geog, new.geog) > 200
     or old.province_code is distinct from new.province_code
     or old.locality_key is distinct from new.locality_key
     or old.neighborhood is distinct from new.neighborhood then
    update public.tenant_moderation m
    set status = 'pending_review', submitted_at = pg_catalog.now(),
        reason = 'Cambió la ubicación: se revisa de nuevo.'
    where m.tenant_id = new.tenant_id and m.status = 'approved';
  end if;
  return new;
end;
$$;
revoke all on function private.tenant_locations_material_change() from public;
drop trigger tenant_locations_material_change on public.tenant_locations;
create trigger tenant_locations_material_change
  after update of lat, lng, province_code, locality_key, neighborhood on public.tenant_locations
  for each row execute function private.tenant_locations_material_change();
