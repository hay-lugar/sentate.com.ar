-- Eventos de pago: registro idempotente, autenticado por secreto y sin lectura pública.
begin;
select plan(9);

select tests.as_anon();
select throws_ok($$ select public.record_payment_event('cualquiera', 'mercadopago', 'e1', 'payment') $$, '42501', 'forbidden', 'sin secreto configurado no hay acceso');
select tests.as_postgres();
update private.settings set payment_worker_secret_sha256 = encode(extensions.digest('secreto-de-pagos', 'sha256'), 'hex');
select tests.as_anon();
select throws_ok($$ select public.record_payment_event('otro', 'mercadopago', 'e1', 'payment') $$, '42501', 'forbidden', 'un secreto incorrecto se rechaza');
select is(public.record_payment_event('secreto-de-pagos', 'mercadopago', 'e1', 'payment', '123', '{"a":1}') ->> 'status', 'recorded', 'un evento nuevo se registra');
select is(public.record_payment_event('secreto-de-pagos', 'mercadopago', 'e1', 'payment', '123', '{"a":1}') ->> 'status', 'duplicate', 'el reintento del proveedor no duplica el evento');
select throws_ok($$ select public.record_payment_event('secreto-de-pagos', 'otro-proveedor', 'e2', 'payment') $$, 'P0001', 'invalid_event', 'solo se aceptan proveedores conocidos');
select throws_ok($$ select public.record_payment_event('secreto-de-pagos', 'mercadopago', '', 'payment') $$, 'P0001', 'invalid_event', 'la clave del evento es obligatoria');
select throws_ok(format($$ select public.record_payment_event('secreto-de-pagos', 'mercadopago', 'e3', 'payment', null, %L::jsonb) $$, jsonb_build_object('x', repeat('a', 20000))), 'P0001', 'payload_too_large', 'el payload tiene tope');
select throws_ok($$ select * from private.payment_events $$, '42501', null, 'el público no lee los eventos');
select tests.as_postgres();
select is((select count(*)::int from private.payment_events), 1, 'quedó un solo evento guardado');

select * from finish();
rollback;
