-- Aislamiento entre el dueño de A y el de B.
begin;
select plan(15);
select tests.seed_two_tenants();

select tests.authenticate_as('owner_a@test.local');
select results_eq($$ select customer_name from public.reservations order by customer_name $$,
  array['Cliente A1', 'Cliente A2'], 'A solo lee reservas de A');
select is_empty($$ select 1 from public.reservations where tenant_id = tests.tenant_id('esquina-b') $$,
  'filtrar por el tenant_id de B no da acceso');
select is_empty($$ update public.reservations set status = 'confirmed'
  where tenant_id = tests.tenant_id('esquina-b') returning id $$, 'A no puede confirmar reservas de B');
select throws_ok($$ update public.reservations set tenant_id = tests.tenant_id('esquina-b') $$, '42501', null,
  'A no puede cambiar tenant_id de sus reservas');
select throws_ok($$ update public.categories set tenant_id = tests.tenant_id('esquina-b') $$, '42501', null,
  'A no puede transferir categorías');
select throws_ok($$ insert into public.categories (tenant_id, name) values (tests.tenant_id('esquina-b'), 'Intrusa') $$,
  '42501', null, 'A no puede crear categorías en B');
-- Aun conociendo el UUID de la categoría de B (p. ej. por la carta pública), la FK compuesta lo impide.
select throws_ok(
  format($$ insert into public.menu_items (tenant_id, category_id, name, price)
     values (%L, %L, 'Cruzado', 100) $$, tests.tenant_id('bodegon-a'),
     (select id from public.categories where name = 'Burgers' and tenant_id = tests.tenant_id('esquina-b'))),
  '23503', null, 'un plato no puede apuntar a una categoría de otro tenant (insert)');
select throws_ok(
  format($$ update public.menu_items set category_id = %L where name = 'Provoleta' $$,
     (select id from public.categories where name = 'Burgers' and tenant_id = tests.tenant_id('esquina-b'))),
  '23503', null, 'un plato no puede moverse a una categoría de otro tenant (update)');

select lives_ok($$ update public.tenants set slug = 'bodegon-a-nuevo' where id = tests.tenant_id('bodegon-a') $$,
  'A puede cambiar su slug');
select is((select count(*)::int from public.reservations), 2, 'tras cambiar el slug, A conserva exactamente su acceso');
select throws_ok($$ update public.tenants set slug = 'esquina-b' where id = tests.tenant_id('bodegon-a-nuevo') $$,
  '23505', null, 'tomar el slug de B no es posible');
select is_empty($$ update public.tenants set name = 'Hackeado' where slug = 'esquina-b' returning id $$,
  'A no puede editar el comercio B aunque conozca su slug');

select tests.authenticate_as('owner_b@test.local');
select results_eq($$ select customer_name from public.reservations $$, array['Cliente B1'], 'B solo lee reservas de B');
select is((select count(*)::int from public.reservations where tenant_id = tests.tenant_id('bodegon-a-nuevo')), 0,
  'el nuevo slug de A no da acceso a B');
select results_eq($$ select name from public.tenants where id = tests.tenant_id('esquina-b') $$, array['Esquina B'],
  'B intacto');

select * from finish();
rollback;
