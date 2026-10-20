-- Fase 3: slugs de demo reservados, topes antiabuso y reemplazo atómico de horarios.
begin;
select plan(11);
select tests.seed_two_tenants();

select tests.authenticate_as('outsider@test.local');
select throws_ok($$ select public.create_tenant('el-bodegon', 'Copia demo') $$, 'P0001', 'slug_taken',
  'los slugs de demo no se pueden dar de alta');

select tests.authenticate_as('owner_a@test.local');
select throws_ok($$ update public.tenants set slug = 'sakura' where slug = 'bodegon-a' $$, '23505', 'slug_taken',
  'tampoco se puede renombrar a un slug de demo');

-- Reemplazo de horarios: atómico y con los permisos del dueño.
select lives_ok(format($$ select public.replace_tenant_schedule(%L, array[1,2,3], %L::jsonb) $$,
  tests.tenant_id('bodegon-a'), '[{"label":"Cena","open":"20:00","close":"01:00"}]'), 'el dueño reemplaza sus horarios');
select is((select count(*)::int from public.tenant_shifts where tenant_id = tests.tenant_id('bodegon-a')), 3,
  'un turno por día abierto');
select throws_ok(format($$ select public.replace_tenant_schedule(%L, array[1], %L::jsonb) $$,
  tests.tenant_id('bodegon-a'), '[{"label":"A","open":"12:00","close":"16:00"},{"label":"B","open":"15:00","close":"18:00"}]'),
  '23P01', 'shift_overlap', 'turnos superpuestos: error');
select is((select count(*)::int from public.tenant_shifts where tenant_id = tests.tenant_id('bodegon-a')), 3,
  'si falla, los horarios anteriores quedan intactos (todo o nada)');
select lives_ok(format($$ select public.replace_tenant_schedule(%L, array[]::int[], '[]'::jsonb) $$, tests.tenant_id('bodegon-a')),
  'se puede dejar sin días abiertos');
select throws_ok(format($$ select public.replace_tenant_schedule(%L, array[1], '[]'::jsonb) $$, tests.tenant_id('esquina-b')),
  '42501', 'forbidden', 'A no reemplaza horarios de B');

-- Topes antiabuso.
select tests.as_postgres();
select public.replace_tenant_schedule(tests.tenant_id('esquina-b'), array[0,1,2,3,4,5,6], '[{"label":"Noche","open":"19:00","close":"23:30"}]')
from (select set_config('request.jwt.claims', json_build_object('sub', tests.uid('owner_b@test.local'))::text, true)) x;
create temp table ctx as select tests.tenant_id('esquina-b') t, tests.next_service_date(3) d;
grant select on ctx to anon;
select tests.as_anon();
select public.request_reservation((select t from ctx), (select d from ctx), h::time, 2, 'Repetido', '11 4444 0000', '', gen_random_uuid())
from unnest(array['19:00', '19:30', '20:00']) h;
select throws_ok(format($$ select public.request_reservation(%L, %L, '20:30', 2, 'Repetido', '11-4444-0000', '', gen_random_uuid()) $$,
  (select t from ctx), (select d from ctx)), 'P0001', 'too_many_pending', 'máx. 3 solicitudes pendientes por teléfono');
select lives_ok(format($$ select public.request_reservation(%L, %L, '20:30', 2, 'Otra persona', '11 4444 9999', '', gen_random_uuid()) $$,
  (select t from ctx), (select d from ctx)), 'otro teléfono puede pedir');

select tests.as_postgres();
insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, idempotency_key, request_fingerprint)
select (select t from ctx), now() + interval '3 days', current_date + 3, 2, 'Flood', '1100000000', gen_random_uuid(), 'x'
from generate_series(1, 30);
select tests.as_anon();
select throws_ok(format($$ select public.request_reservation(%L, %L, '21:00', 2, 'Nueva', '11 3333 0000', '', gen_random_uuid()) $$,
  (select t from ctx), (select d from ctx)), 'P0001', 'rate_limited', 'máx. 30 solicitudes por comercio cada 10 minutos');

select * from finish();
rollback;
