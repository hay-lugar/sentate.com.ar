-- PR3 del plan de lanzamiento: «no se presentó» y el plazo de respuesta visible para quien pidió la mesa.
begin;
select plan(9);

select tests.seed_two_tenants();
select tests.create_user('diner@test.local');
create temp table ctx as select tests.tenant_id('bodegon-a') as a;
grant select on ctx to anon, authenticated;

select tests.as_postgres();
insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, status, user_id) values
  ((select a from ctx), now() - interval '3 hours', (now() - interval '3 hours')::date, 2, 'Pasada Ausente', '+54 11 0000-9301', 'confirmed', tests.uid('diner@test.local')),
  ((select a from ctx), now() + interval '2 days', (now() + interval '2 days')::date, 2, 'Futura Confirmada', '+54 11 0000-9302', 'confirmed', null);
insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, status, hold_expires_at, user_id)
values ((select a from ctx), now() + interval '3 days', (now() + interval '3 days')::date, 2, 'Pendiente Con Plazo', '+54 11 0000-9303', 'pending', now() + interval '4 hours', tests.uid('diner@test.local'));

-- ── El local marca «no se presentó» ──
select tests.authenticate_as('owner_a@test.local');
select lives_ok($$ update public.reservations set status = 'no_show' where customer_name = 'Pasada Ausente' $$, 'una reserva confirmada ya pasada se marca «no se presentó»');
select throws_ok($$ update public.reservations set status = 'no_show' where customer_name = 'Futura Confirmada' $$, '23514', 'invalid_status_transition', 'no antes de la hora');
select throws_ok($$ update public.reservations set status = 'no_show' where customer_name = 'Pendiente Con Plazo' $$, '23514', 'invalid_status_transition', 'una solicitud pendiente no puede pasar a «no se presentó»');
select throws_ok($$ update public.reservations set status = 'confirmed' where customer_name = 'Pasada Ausente' $$, '23514', 'invalid_status_transition', '«no se presentó» es un estado final');

-- ── Otro comercio no puede tocarla ──
select tests.authenticate_as('owner_b@test.local');
update public.reservations set status = 'finished' where customer_name = 'Pasada Ausente';
select tests.as_postgres();
select is((select status::text from public.reservations where customer_name = 'Pasada Ausente'), 'no_show', 'el dueño de otro local no cambia nada');

-- ── Lo que ve la persona que pidió la mesa ──
select tests.authenticate_as('diner@test.local');
select is((select i ->> 'display_status' from jsonb_array_elements(public.my_reservations(null, 50, 0) -> 'items') i where (i ->> 'guests')::int = 2 and i ->> 'status' = 'no_show'), 'no_show', 'se muestra como «no se presentó»');
select ok((select (i ->> 'respond_by') is not null from jsonb_array_elements(public.my_reservations(null, 50, 0) -> 'items') i where i ->> 'status' = 'pending'), 'la solicitud pendiente informa hasta cuándo puede responder el local');
select ok((select bool_and((i ->> 'respond_by') is null) from jsonb_array_elements(public.my_reservations(null, 50, 0) -> 'items') i where i ->> 'status' <> 'pending'), 'las que no están pendientes no tienen plazo');

select * from finish();
rollback;
