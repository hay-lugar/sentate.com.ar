-- Etapa F: etiquetas dietarias y cambio masivo de precios (atómico, aislado por comercio, con control de versión).
begin;
select plan(15);

select tests.seed_two_tenants();
create temp table ids as
select (select id from public.menu_items where name = 'Provoleta' and tenant_id = tests.tenant_id('bodegon-a')) as prov,
       (select id from public.menu_items where name = 'Plato agotado' and tenant_id = tests.tenant_id('bodegon-a')) as agot,
       (select id from public.menu_items where name = 'Doble smash' and tenant_id = tests.tenant_id('esquina-b')) as smash,
       (select updated_at from public.menu_items where name = 'Doble smash' and tenant_id = tests.tenant_id('esquina-b')) as v_smash,
       tests.tenant_id('bodegon-a') as a;
grant select on ids to authenticated;

select tests.authenticate_as('owner_a@test.local');

-- Etiquetas.
select lives_ok($$ update public.menu_items set tags = array['vegan', 'sin-tacc'] where id = (select prov from ids) $$, 'se acepta la etiqueta vegano');
select throws_ok($$ update public.menu_items set tags = array['halal'] where id = (select prov from ids) $$, '23514', null, 'una etiqueta desconocida se rechaza');

-- Cambio masivo.
select is((public.bulk_update_prices((select a from ids),
  jsonb_build_array(jsonb_build_object('id', (select prov from ids), 'price', 10000, 'expected', (select updated_at from public.menu_items where id = (select prov from ids))),
                    jsonb_build_object('id', (select agot from ids), 'price', 5500, 'expected', (select updated_at from public.menu_items where id = (select agot from ids))))) ->> 'updated')::int,
  2, 'actualiza varios precios en una operación');
select is((select price from public.menu_items where id = (select agot from ids)), 5500.00::numeric, 'el precio quedó aplicado');

-- Versión vieja (otra pestaña cambió el plato): no se aplica nada.
select throws_ok($$ select public.bulk_update_prices((select a from ids), jsonb_build_array(
    jsonb_build_object('id', (select prov from ids), 'price', 1, 'expected', (select updated_at from public.menu_items where id = (select prov from ids))),
    jsonb_build_object('id', (select agot from ids), 'price', 1, 'expected', now() - interval '1 hour'))) $$, 'P0001', 'price_conflict', 'una versión vieja produce conflicto');
select is((select price from public.menu_items where id = (select agot from ids)), 5500.00::numeric, 'todo o nada: el plato sin conflicto tampoco cambió');

-- Aislamiento por comercio.
select throws_ok($$ select public.bulk_update_prices((select a from ids), jsonb_build_array(
    jsonb_build_object('id', (select smash from ids), 'price', 1, 'expected', (select v_smash from ids)))) $$, 'P0001', 'price_conflict',
  'un plato de otro comercio se trata como inexistente');
select tests.authenticate_as('owner_b@test.local');
select throws_ok($$ select public.bulk_update_prices((select a from ids), '[]'::jsonb) $$, '42501', 'forbidden', 'otro dueño no opera este comercio');
select tests.as_postgres();
select is((select price from public.menu_items where id = (select smash from ids)), 13900.00::numeric, 'el plato ajeno no se tocó');

-- Validaciones.
select tests.authenticate_as('owner_a@test.local');
select throws_ok($$ select public.bulk_update_prices((select a from ids), '[]'::jsonb) $$, 'P0001', 'invalid_changes', 'sin cambios: rechazado');
select throws_ok($$ select public.bulk_update_prices((select a from ids), jsonb_build_array(
    jsonb_build_object('id', (select prov from ids), 'price', 1, 'expected', now()),
    jsonb_build_object('id', (select prov from ids), 'price', 2, 'expected', now()))) $$, 'P0001', 'invalid_changes', 'ids repetidos: rechazado');
select throws_ok($$ select public.bulk_update_prices((select a from ids), jsonb_build_array(
    jsonb_build_object('id', (select prov from ids), 'price', -5, 'expected', now()))) $$, 'P0001', 'invalid_price', 'precio negativo: rechazado');
select throws_ok($$ select public.bulk_update_prices((select a from ids), jsonb_build_array(
    jsonb_build_object('id', (select prov from ids), 'price', 99999999, 'expected', now()))) $$, 'P0001', 'invalid_price', 'precio fuera de rango: rechazado');

-- Sin sesión / prueba vencida.
select tests.as_anon();
select throws_ok($$ select public.bulk_update_prices(tests.tenant_id('bodegon-a'), '[]'::jsonb) $$, '42501', null, 'anon no ejecuta cambios masivos');
select tests.as_postgres();
update public.tenant_subscriptions set trial_ends_at = now() - interval '1 day', trial_started_at = now() - interval '31 days'
  where tenant_id = (select a from ids);
select tests.authenticate_as('owner_a@test.local');
select throws_ok($$ select public.bulk_update_prices((select a from ids), jsonb_build_array(
    jsonb_build_object('id', (select prov from ids), 'price', 1, 'expected', now()))) $$, '42501', 'forbidden', 'con la prueba vencida no se editan precios');

select * from finish();
rollback;
