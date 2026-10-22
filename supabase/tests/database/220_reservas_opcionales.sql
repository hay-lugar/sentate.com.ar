-- Las reservas son opcionales por comercio: el explorador lo informa y permite filtrar.
begin;
select plan(6);

select tests.as_postgres();
select tests.seed_two_tenants();
update public.tenants set business_type = 'parrilla' where slug = 'bodegon-a';
update public.tenants set business_type = 'cafeteria' where slug = 'esquina-b';
insert into public.tenant_locations (tenant_id, lat, lng, province_code, locality, locality_key, neighborhood, confirmed_at) values
  (tests.tenant_id('bodegon-a'), -31.25, -61.49, 'santa-fe', 'Rafaela', 'rafaela', '', now()),
  (tests.tenant_id('esquina-b'), -31.26, -61.48, 'santa-fe', 'Rafaela', 'rafaela', '', now());
update public.tenant_moderation set status = 'approved' where tenant_id in (tests.tenant_id('bodegon-a'), tests.tenant_id('esquina-b'));
-- B es una cafetería que solo muestra su carta.
insert into public.tenant_reservation_settings (tenant_id, accepts_reservations) values (tests.tenant_id('esquina-b'), false);

create or replace function tests.slugs(p jsonb) returns text[] language sql set search_path = '' as
$$ select coalesce(array_agg(i ->> 'slug' order by i ->> 'slug'), '{}') from pg_catalog.jsonb_array_elements(public.explore_search(p) -> 'items') i
   where i ->> 'slug' not like 'prueba-%' $$;
grant execute on function tests.slugs(jsonb) to anon;

select tests.as_anon();
select is(tests.slugs('{}'::jsonb), array['bodegon-a', 'esquina-b'], 'sin filtro aparecen ambos');
select is(tests.slugs('{"accepts_reservations":true}'::jsonb), array['bodegon-a'], 'filtro «acepta reservas»: solo el que las recibe');
select is(tests.slugs('{"accepts_reservations":false}'::jsonb), array['esquina-b'], 'el inverso lista a quien solo muestra carta');
select is((select (i ->> 'accepts_reservations')::boolean from jsonb_array_elements(public.explore_search('{"q":"esquina"}') -> 'items') i where i ->> 'slug' = 'esquina-b'),
  false, 'cada resultado informa si acepta reservas');
select is((select (i ->> 'accepts_reservations')::boolean from jsonb_array_elements(public.explore_search('{"q":"bodegon"}') -> 'items') i where i ->> 'slug' = 'bodegon-a'),
  true, 'sin configuración = habilitadas');

-- Una solicitud a un local con reservas deshabilitadas se rechaza en la base (no solo se oculta el botón).
select throws_ok(format($$ select public.request_reservation(%L, %L, '21:00', 2, 'Ana Pérez', '+5411000012345', '', gen_random_uuid()) $$,
  tests.tenant_id('esquina-b'), tests.next_service_date(4)), 'P0001', 'reservations_closed', 'la base rechaza reservas en un local que no las recibe');

select * from finish();
rollback;
