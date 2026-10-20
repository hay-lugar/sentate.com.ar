-- Visitante sin sesión y usuario sin membresía.
begin;
select plan(14);
select tests.seed_two_tenants();

select tests.as_anon();
select results_eq($$ select slug from public.tenants where slug in ('bodegon-a', 'esquina-b', 'oculto-u') order by slug $$,
  array['bodegon-a', 'esquina-b'],
  'el visitante ve solo comercios publicados');
select results_eq($$ select name from public.categories where tenant_id = tests.tenant_id('bodegon-a') $$,
  array['Entradas'], 'solo categorías visibles');
select results_eq($$ select name from public.menu_items where tenant_id = tests.tenant_id('bodegon-a') $$,
  array['Provoleta'], 'solo platos disponibles de categorías visibles');
select is((select count(*)::int from public.menu_items where tenant_id = tests.tenant_id('oculto-u')), 0,
  'nada del comercio sin publicar');
select ok((select count(*) from public.tenant_shifts where tenant_id = tests.tenant_id('bodegon-a')) > 0,
  'horarios públicos legibles');
select throws_ok($$ select * from public.reservations $$, '42501', null, 'el visitante no puede leer reservas');
select throws_ok($$ select * from public.tenant_members $$, '42501', null, 'el visitante no puede leer membresías');
select throws_ok($$ select * from public.tenant_subscriptions $$, '42501', null, 'el visitante no puede leer suscripciones');
select throws_ok($$ insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone)
  values (tests.tenant_id('bodegon-a'), now() + interval '1 day', current_date + 1, 2, 'Spam', '1100000000') $$,
  '42501', null, 'el visitante no puede insertar reservas directamente');
select throws_ok($$ update public.menu_items set price = 1 $$, '42501', null, 'el visitante no puede editar la carta');

select tests.authenticate_as('outsider@test.local');
select is((select count(*)::int from public.reservations), 0, 'usuario sin membresía: 0 reservas');
select is((select count(*)::int from public.tenant_subscriptions), 0, 'usuario sin membresía: 0 suscripciones');
select is((select count(*)::int from public.tenant_members), 0, 'usuario sin membresía: 0 membresías');
select is_empty($$ update public.menu_items set price = 1 returning id $$, 'usuario sin membresía no edita platos');

select * from finish();
rollback;
