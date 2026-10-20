-- Gestión por el dueño: transiciones de estado documentadas, campos inmutables.
begin;
select plan(8);
select tests.seed_two_tenants();
select tests.authenticate_as('owner_a@test.local');

select lives_ok($$ update public.reservations set status = 'confirmed' where customer_name = 'Cliente A1' $$,
  'pending → confirmed');
select ok((select decided_at is not null from public.reservations where customer_name = 'Cliente A1'), 'registra decided_at');
select throws_ok($$ update public.reservations set status = 'pending' where customer_name = 'Cliente A1' $$,
  '23514', 'invalid_status_transition', 'confirmed → pending no permitido');
select lives_ok($$ update public.reservations set status = 'cancelled' where customer_name = 'Cliente A1' $$,
  'confirmed → cancelled');
select throws_ok($$ update public.reservations set status = 'confirmed' where customer_name = 'Cliente A1' $$,
  '23514', 'invalid_status_transition', 'cancelled es terminal');
select throws_ok($$ update public.reservations set customer_phone = '1100000000' $$, '42501', null,
  'el dueño no reescribe datos del comensal');
select throws_ok($$ update public.reservations set starts_at = now() $$, '42501', null, 'ni el horario');
select throws_ok($$ insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone)
  values (tests.tenant_id('bodegon-a'), now(), current_date, 2, 'Directa', '1100000000') $$, '42501', null,
  'tampoco inserta reservas directamente (Fase 3: alta manual por función)');

select * from finish();
rollback;
