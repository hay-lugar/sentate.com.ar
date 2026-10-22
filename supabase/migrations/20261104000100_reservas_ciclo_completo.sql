-- {Sin Nombre} · Plan de lanzamiento, PR3: vida completa de la reserva.
--  * Nuevo estado «no se presentó» (no_show): solo desde «confirmada» y recién después de la hora de la reserva.
--  * La persona que pidió la mesa ve hasta cuándo puede responder el local (respond_by): después la solicitud vence sola
--    (el vencimiento ya existía: pending_hold_minutes, 4 h por defecto) y el cupo se libera.
-- Aditiva: un valor nuevo de enum y dos funciones reemplazadas; no toca datos.

alter type public.reservation_status add value if not exists 'no_show';

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
      or (old.status = 'confirmed' and new.status in ('cancelled', 'finished', 'no_show'))
    ) then
      raise exception using errcode = '23514', message = 'invalid_status_transition',
        detail = format('%s -> %s', old.status, new.status);
    end if;
    -- 'expired' lo marca solo el sistema (vencimiento de la retención), no un cliente.
    if new.status = 'expired' and current_user in ('anon', 'authenticated') then
      raise exception using errcode = '23514', message = 'invalid_status_transition',
        detail = format('%s -> %s', old.status, new.status);
    end if;
    -- «Finalizada» y «no se presentó» solo después de la hora de la reserva.
    if new.status in ('finished', 'no_show') and old.starts_at > pg_catalog.now() then
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
                    when r.status = 'confirmed' and r.starts_at + interval '3 hours' < pg_catalog.now() then 'finished'
                    when r.status = 'pending' and r.starts_at < pg_catalog.now() then 'expired'
                    else r.status::text end,
                 'starts_at', r.starts_at, 'service_date', r.service_date, 'guests', r.guests, 'notes', r.notes,
                 'created_at', r.created_at, 'decided_at', r.decided_at,
                 -- Hasta cuándo puede responder el local; después la solicitud vence y se libera el cupo.
                 'respond_by', case when r.status = 'pending' then coalesce(r.hold_expires_at, r.starts_at) end,
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

