-- Horarios posteriores a medianoche: conservan la fecha de servicio; el instante usa la zona del comercio.
begin;
select plan(9);
select tests.seed_two_tenants();

create temp table ctx as
select tests.tenant_id('bodegon-a') as t, tests.next_service_date(5) as fri;  -- un viernes a 2+ días
grant select on ctx to anon;

select tests.as_anon();
create temp table late as
select public.request_reservation((select t from ctx), (select fri from ctx), '01:00', 2, 'Noctámbulo', '1155550101', '',
  gen_random_uuid()) as res;

select is((select (res ->> 'service_date')::date from late), (select fri from ctx),
  '01:00 del turno 20:00–02:00 conserva la fecha de servicio (viernes)');
select is((select ((res ->> 'starts_at')::timestamptz at time zone 'America/Argentina/Buenos_Aires') from late),
  (select (fri + 1) + time '01:00' from ctx), 'el instante es el sábado 01:00 hora de Argentina');
select is((select (res ->> 'starts_at')::timestamptz from late),
  (select ((fri + 1) + time '04:00') at time zone 'UTC' from ctx), 'equivale a las 04:00 UTC (UTC-3, sin horario de verano)');
select throws_ok(format($$ select public.request_reservation(%L, %L, '01:30', 2, 'Tarde', '1155550101', '', gen_random_uuid()) $$,
  (select t from ctx), (select fri from ctx)), 'P0001', 'outside_opening_hours', 'última mesa 1 h antes del cierre (02:00)');
select lives_ok(format($$ select public.request_reservation(%L, %L, '23:30', 2, 'Antes', '1155550101', '', gen_random_uuid()) $$,
  (select t from ctx), (select fri from ctx)), '23:30 sigue en la misma fecha calendario');

select tests.as_postgres();
select is((select service_date from public.reservations where customer_name = 'Noctámbulo'), (select fri from ctx),
  'persistido con la fecha de servicio correcta');

-- Superposición de turnos (incluye el cruce de semana sábado → domingo).
select throws_ok(format($$ insert into public.tenant_shifts (tenant_id, weekday, opens_at, closes_at)
  values (%L, 1, '15:00', '18:00') $$, (select t from ctx)), '23P01', 'shift_overlap', 'turnos superpuestos el mismo día');
select throws_ok(format($$ insert into public.tenant_shifts (tenant_id, weekday, opens_at, closes_at)
  values (%L, 0, '01:00', '03:00') $$, (select t from ctx)), '23P01', 'shift_overlap',
  'el domingo 01:00 choca con el turno del sábado 20:00–02:00');
select lives_ok(format($$ insert into public.tenant_shifts (tenant_id, weekday, opens_at, closes_at)
  values (%L, 0, '02:00', '04:00') $$, (select t from ctx)), 'un turno que empieza al cierre del anterior es válido');

select * from finish();
rollback;
