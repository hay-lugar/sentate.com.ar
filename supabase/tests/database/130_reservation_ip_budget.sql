-- Cupo por conexión para solicitudes de mesa (migración 20261022000200).
begin;
select plan(13);

select tests.as_anon();

select ok(has_function_privilege('anon', 'public.consume_reservation_ip_budget(text)', 'EXECUTE'),
  'el formulario público (anon) puede consumir el cupo');

select is((public.consume_reservation_ip_budget(repeat('a', 64)) ->> 'allowed')::boolean, true, 'la primera solicitud de una conexión pasa');
select lives_ok($q$ select public.consume_reservation_ip_budget(repeat('a', 64)) from generate_series(1, 11) $q$,
  'hasta 12 solicitudes en 10 minutos pasan');
select is((public.consume_reservation_ip_budget(repeat('a', 64)) ->> 'allowed')::boolean, false, 'la solicitud 13 de la misma conexión se bloquea');
select is(public.consume_reservation_ip_budget(repeat('a', 64)) ->> 'window', '10m', 'el bloqueo informa la ventana de 10 minutos');
select ok((public.consume_reservation_ip_budget(repeat('a', 64)) ->> 'retry_after_seconds')::integer between 1 and 600,
  'informa cuánto esperar (entre 1 y 600 segundos)');
select is((public.consume_reservation_ip_budget(repeat('b', 64)) ->> 'allowed')::boolean, true, 'otra conexión tiene su propio cupo');

select throws_ok($q$ select public.consume_reservation_ip_budget('abc') $q$, 'P0001', 'invalid_request', 'una clave corta se rechaza');
select throws_ok($q$ select public.consume_reservation_ip_budget(null) $q$, 'P0001', 'invalid_request', 'una clave nula se rechaza');
select throws_ok($q$ select public.consume_reservation_ip_budget(repeat('A', 64)) $q$, 'P0001', 'invalid_request',
  'solo hexadecimal en minúsculas (un HMAC), no texto libre');
select throws_ok($q$ select public.consume_reservation_ip_budget('203.0.113.10') $q$, 'P0001', 'invalid_request',
  'una IP en claro no es una clave válida: la base nunca la recibe');

select throws_ok($q$ select * from private.rate_limit_hits $q$, '42501', null, 'el público no puede leer los contadores');

-- Ventana diaria: 60 por día, aunque cada ventana de 10 minutos esté bajo su tope.
select tests.as_postgres();
insert into private.rate_limit_hits (scope, key, window_start, hits)
values ('reservation_1d', repeat('d', 64), pg_catalog.to_timestamp(floor(extract(epoch from clock_timestamp()) / 86400) * 86400), 60);
select tests.as_anon();
select is(public.consume_reservation_ip_budget(repeat('d', 64)) ->> 'window', '1d', 'al pasar 60 en el día se bloquea por la ventana diaria');

select * from finish();
rollback;
