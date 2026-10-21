-- Etapa C: búsqueda del explorador, filtros, abierto ahora, cercanía y no filtración de comercios no listados.
begin;
select plan(24);

select tests.as_postgres();
select tests.seed_two_tenants();

-- Bodegón A (Rafaela, parrilla) y Esquina B (CABA, bar) aprobados y con ubicación; U sigue en borrador.
update public.tenants set business_type = 'parrilla', price_range = '$$' where slug = 'bodegon-a';
update public.tenants set business_type = 'bar', price_range = '$$$' where slug = 'esquina-b';
insert into public.tenant_locations (tenant_id, lat, lng, province_code, locality, locality_key, neighborhood, confirmed_at) values
  (tests.tenant_id('bodegon-a'), -31.25, -61.49, 'santa-fe', 'Rafaela', 'rafaela', 'Centro', now()),
  (tests.tenant_id('esquina-b'), -34.58, -58.43, 'caba', 'Palermo', 'palermo', 'Palermo Soho', now()),
  (tests.tenant_id('oculto-u'), -34.60, -58.40, 'caba', 'Almagro', 'almagro', '', now());
insert into public.tenant_cuisines (tenant_id, cuisine_code) values
  (tests.tenant_id('bodegon-a'), 'parrilla'), (tests.tenant_id('esquina-b'), 'hamburguesas');
update public.tenant_moderation set status = 'approved' where tenant_id in (tests.tenant_id('bodegon-a'), tests.tenant_id('esquina-b'));
update public.tenants set business_type = 'bar', is_published = true where slug = 'oculto-u';

create or replace function tests.names(p jsonb) returns text[] language sql set search_path = '' as
$$ select coalesce(array_agg(i ->> 'slug' order by ord), '{}') from pg_catalog.jsonb_array_elements(public.explore_search(p) -> 'items') with ordinality t(i, ord)
   where i ->> 'slug' not like 'prueba-%' $$;
grant execute on function tests.names(jsonb) to anon, authenticated;

select tests.as_anon();

-- Visibilidad.
select is(tests.names('{}'::jsonb), array['bodegon-a', 'esquina-b'], 'solo se listan comercios aprobados y completos');
select is((select count(*)::int from jsonb_array_elements(public.explore_search('{"limit":500}') -> 'items') i where i ->> 'slug' not like 'prueba-%'), 2, 'el total cuenta solo listados');
select is(tests.names('{"q":"oculto"}'::jsonb), '{}'::text[], 'un comercio no aprobado no aparece ni buscándolo por nombre');

-- Texto: nombre, localidad, tipo, cocina, plato, tolerancia a tildes y errores.
select is(tests.names('{"q":"bodegon"}'::jsonb), array['bodegon-a'], 'busca por nombre (sin tildes)');
select is(tests.names('{"q":"rafaela"}'::jsonb), array['bodegon-a'], 'busca por localidad');
select is(tests.names('{"q":"parilla"}'::jsonb), array['bodegon-a'], 'tolera un error de tipeo (parilla → parrilla)');
select is(tests.names('{"q":"hamburguesas"}'::jsonb), array['esquina-b'], 'busca por cocina');
select is(tests.names('{"q":"provoleta"}'::jsonb), array['bodegon-a'], 'busca por plato disponible');
select is(tests.names('{"q":"agotado"}'::jsonb), '{}'::text[], 'no encuentra platos no disponibles');
select is(tests.names('{"q":"categoria oculta"}'::jsonb), '{}'::text[], 'no encuentra platos de categorías ocultas');

-- Filtros.
select is(tests.names('{"locality_key":"palermo"}'::jsonb), array['esquina-b'], 'filtra por localidad');
select is(tests.names('{"business_types":["bar"]}'::jsonb), array['esquina-b'], 'filtra por tipo de comercio');
select is(tests.names('{"cuisines":["parrilla","pizza"]}'::jsonb), array['bodegon-a'], 'filtra por cocina');
select is(tests.names('{"price":["$$$"]}'::jsonb), array['esquina-b'], 'filtra por rango de precio');
select throws_ok($$ select public.explore_search('{"limit":9999}') $$, 'P0001', 'invalid_filter', 'límite acotado');
select throws_ok($$ select public.explore_search('{"lat":-31}') $$, 'P0001', 'invalid_filter', 'lat sin lng rechazado');

-- Abierto ahora (zona del comercio, cruce de medianoche y cierres).
-- A: almuerzo 12–16 y cena 20–02 todos los días. B: 19:00–23:30.
select is(tests.names(jsonb_build_object('open_now', true, 'at', ((current_date + 20) + time '13:00') at time zone 'America/Argentina/Buenos_Aires')),
  array['bodegon-a'], 'a las 13:00 abre A (almuerzo) y B no');
select is(tests.names(jsonb_build_object('open_now', true, 'at', ((current_date + 20) + time '01:00') at time zone 'America/Argentina/Buenos_Aires')),
  array['bodegon-a'], 'a la 1:00 sigue abierto A (cena que cruza la medianoche)');
select is(tests.names(jsonb_build_object('open_now', true, 'at', ((current_date + 20) + time '03:00') at time zone 'America/Argentina/Buenos_Aires')),
  '{}'::text[], 'a las 3:00 no abre ninguno');
select tests.as_postgres();
insert into public.tenant_closures (tenant_id, service_date, reason)
values (tests.tenant_id('bodegon-a'), current_date + 19, 'Feriado');
select tests.as_anon();
select is(tests.names(jsonb_build_object('open_now', true, 'at', ((current_date + 20) + time '01:00') at time zone 'America/Argentina/Buenos_Aires')),
  '{}'::text[], 'la madrugada de una fecha de servicio cerrada no cuenta como abierta');
select is(tests.names(jsonb_build_object('open_now', true, 'at', ((current_date + 20) + time '21:00') at time zone 'America/Argentina/Buenos_Aires')),
  array['bodegon-a', 'esquina-b'], 'a las 21:00 abren ambos');

-- Cercanía: distancia aproximada, orden y radio. El punto está cerca de B.
select is(tests.names('{"lat":-34.59,"lng":-58.42,"sort":"distance"}'::jsonb), array['esquina-b', 'bodegon-a'], 'ordena por cercanía');
select is(tests.names('{"lat":-34.59,"lng":-58.42,"radius_km":20}'::jsonb), array['esquina-b'], 'el radio excluye lo lejano');
select ok((public.explore_search('{"lat":-34.59,"lng":-58.42}') -> 'items' -> 0 ->> 'distance_m') is not null, 'devuelve distancia aproximada');

select * from finish();
rollback;
