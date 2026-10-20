-- Fase 3.1: ajustes transaccionales con concurrencia, horarios por día sin pérdida,
-- reordenamiento atómico y Realtime de reservas autorizado por RLS.
begin;
select plan(25);
select tests.seed_two_tenants();

create temp table v as select tests.tenant_id('bodegon-a') a, tests.tenant_id('esquina-b') b,
  (select updated_at from public.tenants where slug = 'bodegon-a') ver_a;
grant select on v to authenticated, anon;

-- ── save_tenant_settings ──
select tests.authenticate_as('owner_a@test.local');

-- Horarios DISTINTOS por día + cierre excepcional + turno que cruza medianoche.
select lives_ok(format($$ select public.save_tenant_settings(%L, %L, %L::jsonb, %L::jsonb) $$,
  (select a from v), (select ver_a from v),
  '{"name":"Bodegón A2","primary_color":"#123456"}',
  '{"week":[[{"label":"Almuerzo","open":"12:00","close":"16:00"}],[],
            [{"label":"Almuerzo","open":"12:00","close":"16:00"},{"label":"Cena","open":"20:00","close":"01:00"}],
            [{"label":"Cena","open":"21:00","close":"23:30"}],[],[],
            [{"label":"Trasnoche","open":"22:00","close":"04:00"}]],
    "closures":[{"date":"2099-12-25","reason":"Navidad"}]}'),
  'el dueño guarda perfil + horarios por día en una operación');
select is((select name from public.tenants where id = (select a from v)), 'Bodegón A2', 'perfil guardado');
select is((select array_agg(weekday || ' ' || label || ' ' || opens_at || '-' || closes_at order by weekday, opens_at)
           from public.tenant_shifts where tenant_id = (select a from v)),
  array['0 Almuerzo 12:00:00-16:00:00', '2 Almuerzo 12:00:00-16:00:00', '2 Cena 20:00:00-01:00:00',
        '3 Cena 21:00:00-23:30:00', '6 Trasnoche 22:00:00-04:00:00'],
  'cada día conserva sus propios turnos (incluido el cruce de medianoche)');
select is((select reason from public.tenant_closures where tenant_id = (select a from v) and service_date = '2099-12-25'),
  'Navidad', 'cierre excepcional guardado');

-- Guardar solo el perfil (p_schedule null) NO toca horarios ni cierres.
select lives_ok(format($$ select public.save_tenant_settings(%L, %L, %L::jsonb) $$,
  (select a from v), (select updated_at from public.tenants where id = (select a from v)), '{"accent_color":"#fafafa"}'),
  'guardar colores sin horarios');
select is((select count(*)::int from public.tenant_shifts where tenant_id = (select a from v)), 5,
  'guardar colores no reescribe horarios');
select is((select count(*)::int from public.tenant_closures where tenant_id = (select a from v)), 1,
  'guardar colores no borra cierres');

-- Concurrencia: una versión vieja no pisa cambios ajenos.
select throws_ok(format($$ select public.save_tenant_settings(%L, %L, %L::jsonb) $$,
  (select a from v), '2000-01-01T00:00:00Z', '{"name":"Pisado"}'), 'P0001', 'stale_write',
  'versión desactualizada: stale_write');
select is((select name from public.tenants where id = (select a from v)), 'Bodegón A2', 'stale_write no modificó nada');

-- Todo o nada: superposición entre días (domingo 22–04 vs lunes 02:00) revierte también el perfil.
select throws_ok(format($$ select public.save_tenant_settings(%L, %L, %L::jsonb, %L::jsonb) $$,
  (select a from v), (select updated_at from public.tenants where id = (select a from v)),
  '{"name":"No debería quedar"}',
  '{"week":[[{"label":"Noche","open":"22:00","close":"04:00"}],[{"label":"Madrugada","open":"02:00","close":"06:00"}],[],[],[],[],[]],"closures":[]}'),
  '23P01', 'shift_overlap', 'superposición entre días: error');
select is((select name from public.tenants where id = (select a from v)), 'Bodegón A2', 'el perfil tampoco se guardó (atómico)');
select is((select count(*)::int from public.tenant_shifts where tenant_id = (select a from v)), 5, 'los horarios anteriores quedan intactos');

select throws_ok(format($$ select public.save_tenant_settings(%L, %L, '{}'::jsonb) $$,
  (select b from v), (select updated_at from public.tenants where id = (select b from v))),
  '42501', 'forbidden', 'A no guarda ajustes de B');
select throws_ok(format($$ select public.save_tenant_settings(%L, %L, '{}'::jsonb, '{"week":[[],[]]}'::jsonb) $$,
  (select a from v), (select updated_at from public.tenants where id = (select a from v))),
  'P0001', 'invalid_schedule', 'semana mal formada: invalid_schedule');

-- ── reorder_categories ──
select lives_ok(format($$ select public.reorder_categories(%L, array(select id from public.categories where tenant_id = %L order by position desc)) $$,
  (select a from v), (select a from v)), 'reordena todas las categorías en una operación');
select is((select array_agg(name order by position) from public.categories where tenant_id = (select a from v)),
  array['Oculta', 'Entradas'], 'nuevo orden aplicado');
select throws_ok(format($$ select public.reorder_categories(%L, array(select id from public.categories where tenant_id = %L limit 1)) $$,
  (select a from v), (select a from v)), 'P0001', 'stale_write', 'lista incompleta (otra sesión cambió categorías): stale_write');
select throws_ok(format($$ select public.reorder_categories(%L, array(select id from public.categories where tenant_id = %L)) $$,
  (select b from v), (select b from v)), '42501', 'forbidden', 'A no reordena categorías de B');

-- ── Realtime: el trigger publica en el canal privado del comercio, sin datos personales ──
select tests.as_postgres();
update public.reservations set status = 'confirmed' where tenant_id = (select b from v) and status = 'pending';
select is((select count(*)::int from realtime.messages where topic = 'tenant:' || (select b from v) || ':reservations'
           and event = 'reservation_changed' and private and payload ->> 'op' = 'update'), 1,
  'cambio de estado publicado en el canal privado de B');
select is((select (payload ? 'customer_name') or (payload ? 'customer_phone') from realtime.messages
           where topic = 'tenant:' || (select b from v) || ':reservations' limit 1), false,
  'el evento no incluye nombre ni teléfono');

-- Autorización del canal (RLS de realtime.messages con realtime.topic()).
select tests.authenticate_as('owner_b@test.local');
select set_config('realtime.topic', 'tenant:' || (select b from v) || ':reservations', true);
select is((select count(*)::int from realtime.messages), 2, 'el dueño B recibe los eventos de su comercio (alta + cambio)');

select tests.authenticate_as('owner_a@test.local');
select set_config('realtime.topic', 'tenant:' || (select b from v) || ':reservations', true);
select is((select count(*)::int from realtime.messages), 0, 'el dueño A NO recibe eventos del comercio B');

select tests.authenticate_as('outsider@test.local');
select set_config('realtime.topic', 'tenant:' || (select b from v) || ':reservations', true);
select is((select count(*)::int from realtime.messages), 0, 'un usuario sin membresía no recibe nada');

select tests.authenticate_as('owner_b@test.local');
select set_config('realtime.topic', 'tenant:no-es-un-uuid:reservations', true);
select is((select count(*)::int from realtime.messages), 0, 'topics mal formados no autorizan (sin error de casteo)');

select tests.as_anon();
select set_config('realtime.topic', 'tenant:' || (select b from v) || ':reservations', true);
select is((select count(*)::int from realtime.messages), 0, 'anon no recibe nada');

select * from finish();
rollback;
