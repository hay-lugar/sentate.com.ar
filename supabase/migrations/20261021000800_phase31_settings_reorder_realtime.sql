-- Sentate · Fase 3.1 · 08: ajustes transaccionales con control de concurrencia, reordenamiento
-- atómico de categorías y Realtime de reservas autorizado por RLS.
--
-- Todas las funciones públicas son SECURITY INVOKER: corren con la sesión del dueño, así que RLS
-- (can_operate = miembro + prueba/suscripción vigente) sigue siendo la autorización. Lo único
-- SECURITY DEFINER es el trigger que publica eventos de Realtime (escribe en realtime.messages).

-- ───────────────────────── Ajustes: perfil + horarios en una transacción ─────────────────────────
-- p_expected_version = tenants.updated_at que el panel leyó. Si cambió (otra pestaña u otro
-- dispositivo guardó antes), falla con stale_write y no pisa nada.
-- p_schedule null = no tocar horarios (guardar colores o datos NO reescribe turnos ni cierres).
-- Formato de p_schedule:
--   { "week": [[{"label","open","close"}...] × 7 (0 = domingo)],
--     "closures": [{"date": "YYYY-MM-DD", "reason": "..."}] }
-- Los cierres se reemplazan desde hoy (fecha local del comercio) en adelante; el historial queda.
create or replace function public.save_tenant_settings(
  p_tenant_id uuid,
  p_expected_version timestamptz,
  p_profile jsonb,
  p_schedule jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_current timestamptz;
  v_tz text;
  v_today date;
  v_shift jsonb;
  v_closure jsonb;
  v_version timestamptz;
begin
  if p_tenant_id is null or p_expected_version is null or p_profile is null
     or pg_catalog.jsonb_typeof(p_profile) <> 'object' then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  if not private.can_operate(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  -- Bloquea la fila del comercio: dos guardados simultáneos se serializan acá.
  select t.updated_at, t.timezone into v_current, v_tz from public.tenants t where t.id = p_tenant_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if v_current <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale_write';
  end if;

  -- Perfil: solo columnas editables por el dueño (mismas que el grant por columna).
  -- Siempre se actualiza la fila (aunque solo cambien horarios) para avanzar la versión.
  update public.tenants t set
    name = coalesce(p_profile ->> 'name', t.name),
    tagline = coalesce(p_profile ->> 'tagline', t.tagline),
    cuisine = coalesce(p_profile ->> 'cuisine', t.cuisine),
    price_range = coalesce(p_profile ->> 'price_range', t.price_range),
    address = coalesce(p_profile ->> 'address', t.address),
    phone = coalesce(p_profile ->> 'phone', t.phone),
    timezone = coalesce(p_profile ->> 'timezone', t.timezone),
    logo_url = case when p_profile ? 'logo_url' then nullif(p_profile ->> 'logo_url', '') else t.logo_url end,
    primary_color = coalesce(p_profile ->> 'primary_color', t.primary_color),
    primary_fg_color = coalesce(p_profile ->> 'primary_fg_color', t.primary_fg_color),
    accent_color = coalesce(p_profile ->> 'accent_color', t.accent_color),
    accent_fg_color = coalesce(p_profile ->> 'accent_fg_color', t.accent_fg_color)
  where t.id = p_tenant_id
  returning t.updated_at, t.timezone into v_version, v_tz;

  if p_schedule is not null then
    if pg_catalog.jsonb_typeof(p_schedule -> 'week') <> 'array' or pg_catalog.jsonb_array_length(p_schedule -> 'week') <> 7
       or pg_catalog.jsonb_typeof(coalesce(p_schedule -> 'closures', '[]'::jsonb)) <> 'array'
       or pg_catalog.jsonb_array_length(coalesce(p_schedule -> 'closures', '[]'::jsonb)) > 60 then
      raise exception using errcode = 'P0001', message = 'invalid_schedule';
    end if;

    delete from public.tenant_shifts where tenant_id = p_tenant_id;
    for v_day in 0..6 loop
      if pg_catalog.jsonb_typeof(p_schedule -> 'week' -> v_day) <> 'array'
         or pg_catalog.jsonb_array_length(p_schedule -> 'week' -> v_day) > 3 then
        raise exception using errcode = 'P0001', message = 'invalid_schedule';
      end if;
      for v_shift in select * from pg_catalog.jsonb_array_elements(p_schedule -> 'week' -> v_day) loop
        -- El trigger tenant_shifts_no_overlap valida superposición (semana circular) y duración.
        insert into public.tenant_shifts (tenant_id, weekday, label, opens_at, closes_at)
        values (p_tenant_id, v_day, coalesce(v_shift ->> 'label', ''),
          (v_shift ->> 'open')::time, (v_shift ->> 'close')::time);
      end loop;
    end loop;

    v_today := (pg_catalog.now() at time zone v_tz)::date;
    delete from public.tenant_closures where tenant_id = p_tenant_id and service_date >= v_today;
    for v_closure in select * from pg_catalog.jsonb_array_elements(coalesce(p_schedule -> 'closures', '[]'::jsonb)) loop
      if (v_closure ->> 'date')::date >= v_today then
        insert into public.tenant_closures (tenant_id, service_date, reason)
        values (p_tenant_id, (v_closure ->> 'date')::date, coalesce(v_closure ->> 'reason', ''));
      end if;
    end loop;
  end if;

  return pg_catalog.jsonb_build_object('version', v_version);
end;
$$;
revoke all on function public.save_tenant_settings(uuid, timestamptz, jsonb, jsonb) from public;
grant execute on function public.save_tenant_settings(uuid, timestamptz, jsonb, jsonb) to authenticated;

-- ───────────────────────── Reordenamiento atómico de categorías ─────────────────────────
-- p_ordered_ids debe ser EXACTAMENTE el conjunto actual de categorías del comercio. Si otra sesión
-- agregó o borró una categoría, el conjunto no coincide → stale_write (no se reordena a medias).
create or replace function public.reorder_categories(p_tenant_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_current uuid[];
begin
  if not private.can_operate(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_ordered_ids is null or cardinality(p_ordered_ids) <> cardinality(array(select distinct pg_catalog.unnest(p_ordered_ids))) then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  -- Bloquea las categorías del comercio mientras se reordena.
  select coalesce(array_agg(c.id order by c.id), '{}') into v_current
  from (select id from public.categories where tenant_id = p_tenant_id for update) c;
  if v_current <> coalesce((select array_agg(x order by x) from pg_catalog.unnest(p_ordered_ids) x), '{}') then
    raise exception using errcode = 'P0001', message = 'stale_write';
  end if;
  update public.categories c set position = o.ord - 1
  from pg_catalog.unnest(p_ordered_ids) with ordinality o(id, ord)
  where c.id = o.id and c.tenant_id = p_tenant_id and c.position is distinct from o.ord - 1;
end;
$$;
revoke all on function public.reorder_categories(uuid, uuid[]) from public;
grant execute on function public.reorder_categories(uuid, uuid[]) to authenticated;

-- ───────────────────────── Realtime de reservas ─────────────────────────
-- Broadcast desde la base a un canal PRIVADO por comercio: tenant:<uuid>:reservations.
-- El evento lleva solo id/estado/versión (sin nombre ni teléfono): el panel vuelve a leer la fila
-- con su sesión, así que los datos personales siempre pasan por la RLS de public.reservations.
create or replace function private.reservations_topic_tenant(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^tenant:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:reservations$'
    then pg_catalog.substr(p_topic, 8, 36)::uuid
  end;
$$;
grant execute on function private.reservations_topic_tenant(text) to authenticated;

create or replace function private.reservations_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      pg_catalog.jsonb_build_object('id', new.id, 'status', new.status, 'version', new.updated_at,
        'op', pg_catalog.lower(tg_op)),
      'reservation_changed',
      'tenant:' || new.tenant_id::text || ':reservations',
      true
    );
  exception when others then
    -- Realtime es best-effort: nunca debe impedir guardar una solicitud o un cambio de estado.
    raise warning 'reservations_broadcast: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.reservations_broadcast() from public;

drop trigger if exists reservations_broadcast on public.reservations;
create trigger reservations_broadcast after insert or update on public.reservations
  for each row execute function private.reservations_broadcast();

-- Recibir del canal: solo miembros que pueden operar el comercio (misma regla que leer reservas).
-- No hay política de INSERT: los clientes no pueden publicar en estos canales.
drop policy if exists sentate_reservations_receive on realtime.messages;
create policy sentate_reservations_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    -- Además de autorizar el canal, cada fila debe pertenecer al canal autorizado.
    and realtime.messages.topic = (select realtime.topic())
    and private.reservations_topic_tenant((select realtime.topic())) is not null
    and private.can_operate(private.reservations_topic_tenant((select realtime.topic())))
  );
