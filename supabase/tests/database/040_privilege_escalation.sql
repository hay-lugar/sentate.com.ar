-- Nadie se autoasigna owner, eleva su rol ni edita la suscripción.
begin;
select plan(12);
select tests.seed_two_tenants();

select tests.authenticate_as('outsider@test.local');
select throws_ok(format($$ insert into public.tenant_members (tenant_id, user_id, role) values (%L, %L, 'owner') $$,
  tests.tenant_id('bodegon-a'), tests.uid('outsider@test.local')), '42501', null, 'un extraño no puede hacerse owner');
select is_empty($$ select 1 from public.tenants where slug = 'oculto-u' $$,
  'user_metadata con tenant_id/rol no concede acceso (las políticas no lo leen)');

select tests.authenticate_as('owner_a@test.local');
select throws_ok(format($$ insert into public.tenant_members (tenant_id, user_id, role) values (%L, %L, 'owner') $$,
  tests.tenant_id('esquina-b'), tests.uid('owner_a@test.local')), '42501', null, 'A no puede sumarse a B');
select throws_ok($$ update public.tenant_members set role = 'owner' $$, '42501', null, 'A no puede editar membresías');
select throws_ok($$ delete from public.tenant_members $$, '42501', null, 'A no puede borrar membresías');
select throws_ok($$ update public.tenant_subscriptions set trial_ends_at = now() + interval '10 years' $$, '42501', null,
  'A no puede extender su prueba');
select throws_ok($$ update public.tenant_subscriptions set status = 'active', current_period_ends_at = now() + interval '1 year' $$,
  '42501', null, 'A no puede marcarse como suscripto');
select throws_ok(format($$ insert into public.tenant_subscriptions (tenant_id, status, trial_ends_at) values (%L, 'active', now()) $$,
  tests.tenant_id('bodegon-a')), '42501', null, 'A no puede crear suscripciones');
select throws_ok($$ update public.tenants set status = 'active' $$, '42501', null, 'A no puede cambiar el estado operativo');
select throws_ok($$ delete from public.tenants $$, '42501', null, 'A no puede borrar comercios');
select throws_ok($$ delete from public.reservations $$, '42501', null, 'A no puede borrar reservas');
select results_eq($$ select status::text from public.tenant_subscriptions $$, array['trialing'],
  'A puede LEER su suscripción (pantalla de suscripción)');

select * from finish();
rollback;
