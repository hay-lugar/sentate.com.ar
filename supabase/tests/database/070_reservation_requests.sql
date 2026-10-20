-- Solicitud pública de reserva: fuerza pending, valida datos, idempotente, respuesta mínima.
begin;
select plan(20);
select tests.seed_two_tenants();

create temp table ctx as
select tests.tenant_id('bodegon-a') as tenant_a,
       tests.tenant_id('oculto-u') as tenant_hidden,
       tests.next_service_date(4) as d,                      -- un jueves a 2+ días
       'a0000000-0000-4000-8000-000000000001'::uuid as k1;
grant select on ctx to anon, authenticated;

select tests.as_anon();
create temp table r1 as
select public.request_reservation((select tenant_a from ctx), (select d from ctx), '21:00', 4,
  '  Ana Pérez ', '+54 (11) 0000-1234', 'Ventana', (select k1 from ctx)) as res;

select is((select res ->> 'status' from r1), 'pending', 'la solicitud queda pending');
select is((select array_agg(k order by k) from r1, jsonb_object_keys(res) k),
  array['replayed', 'reservation_id', 'service_date', 'starts_at', 'status'], 'respuesta mínima (sin datos de otras reservas)');
select is((select (res ->> 'replayed')::boolean from r1), false, 'primera vez: no es replay');

-- Reintento idempotente (misma clave, mismo contenido).
select is((public.request_reservation((select tenant_a from ctx), (select d from ctx), '21:00', 4,
  'Ana Pérez', '+54 (11) 0000-1234', 'Ventana', (select k1 from ctx)) ->> 'reservation_id'),
  (select res ->> 'reservation_id' from r1), 'reintento devuelve la misma reserva');
select throws_ok(format($$ select public.request_reservation(%L, %L, '21:30', 4, 'Ana Pérez', '1100001234', '', %L) $$,
  (select tenant_a from ctx), (select d from ctx), (select k1 from ctx)),
  'P0001', 'idempotency_key_reused', 'misma clave con otros datos: rechazada');

-- Validaciones (todas como anon).
select throws_ok(format($$ select public.request_reservation(%L, %L, '21:00', 0, 'Ana', '1100001234', '', gen_random_uuid()) $$,
  (select tenant_a from ctx), (select d from ctx)), 'P0001', 'invalid_guests', 'cero personas');
select throws_ok(format($$ select public.request_reservation(%L, %L, '21:00', 9, 'Ana', '1100001234', '', gen_random_uuid()) $$,
  (select tenant_a from ctx), (select d from ctx)), 'P0001', 'invalid_guests', 'más de 8 personas');
select throws_ok(format($$ select public.request_reservation(%L, %L, '21:00', 2, 'A', '1100001234', '', gen_random_uuid()) $$,
  (select tenant_a from ctx), (select d from ctx)), 'P0001', 'invalid_name', 'nombre demasiado corto');
select throws_ok(format($$ select public.request_reservation(%L, %L, '21:00', 2, 'Ana', '11-abc-1234', '', gen_random_uuid()) $$,
  (select tenant_a from ctx), (select d from ctx)), 'P0001', 'invalid_phone', 'teléfono inválido');
select throws_ok(format($$ select public.request_reservation(%L, %L, '21:00', 2, 'Ana', '1100001234', repeat('x', 281), gen_random_uuid()) $$,
  (select tenant_a from ctx), (select d from ctx)), 'P0001', 'invalid_notes', 'comentario demasiado largo');
select throws_ok(format($$ select public.request_reservation(%L, %L, '21:15', 2, 'Ana', '1100001234', '', gen_random_uuid()) $$,
  (select tenant_a from ctx), (select d from ctx)), 'P0001', 'invalid_slot', 'horario fuera de la grilla de 30 min');
select throws_ok(format($$ select public.request_reservation(%L, %L, '17:00', 2, 'Ana', '1100001234', '', gen_random_uuid()) $$,
  (select tenant_a from ctx), (select d from ctx)), 'P0001', 'outside_opening_hours', 'entre turnos');
select throws_ok(format($$ select public.request_reservation(%L, %L, '12:00', 2, 'Ana', '1100001234', '', gen_random_uuid()) $$,
  (select tenant_a from ctx), (select d from ctx) + 30), 'P0001', 'date_out_of_range', 'fuera de la ventana de 14 días');
select throws_ok(format($$ select public.request_reservation(%L, %L, '12:00', 2, 'Ana', '1100001234', '', gen_random_uuid()) $$,
  (select tenant_a from ctx), (now() at time zone 'America/Argentina/Buenos_Aires')::date - 1),
  'P0001', 'slot_too_soon', 'un turno que ya pasó');
select throws_ok(format($$ select public.request_reservation(%L, %L, '20:00', 2, 'Ana', '1100001234', '', gen_random_uuid()) $$,
  (select tenant_hidden from ctx), (select d from ctx)), 'P0001', 'tenant_unavailable', 'comercio sin publicar');
select throws_ok(format($$ select public.request_reservation(%L, %L, '20:00', 2, 'Ana', '1100001234', '', gen_random_uuid()) $$,
  gen_random_uuid(), (select d from ctx)), 'P0001', 'tenant_unavailable', 'comercio inexistente (mismo error)');

select tests.as_postgres();
insert into public.tenant_closures (tenant_id, service_date, reason) select tenant_a, d + 7, 'Feriado' from ctx;
select tests.as_anon();
select throws_ok(format($$ select public.request_reservation(%L, %L, '21:00', 2, 'Ana', '1100001234', '', gen_random_uuid()) $$,
  (select tenant_a from ctx), (select d from ctx) + 7), 'P0001', 'tenant_closed', 'día de cierre puntual');

-- Un usuario autenticado tampoco puede forzar otro estado (la firma no lo acepta y se fuerza pending).
select tests.authenticate_as('outsider@test.local');
select is(public.request_reservation((select tenant_a from ctx), (select d from ctx), '13:00', 2, 'Beto', '1100000000', '',
  gen_random_uuid()) ->> 'status', 'pending', 'usuario con sesión: también pending');

select tests.as_postgres();
select is((select count(*)::int from public.reservations r, ctx where r.idempotency_key = ctx.k1), 1,
  'el reintento no duplicó la reserva');
select results_eq($$ select customer_name, status::text from public.reservations r, ctx where r.idempotency_key = ctx.k1 $$,
  $$ values ('Ana Pérez', 'pending') $$, 'datos normalizados y estado pending persistidos');

select * from finish();
rollback;
