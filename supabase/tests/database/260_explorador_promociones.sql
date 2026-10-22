-- Filtro «Con promoción» del explorador.
begin;
select plan(5);

select tests.as_postgres();
select tests.seed_two_tenants();
select tests.create_user('admin@test.local');
insert into private.platform_admins (user_id) values (tests.uid('admin@test.local'));
update public.tenants set business_type = 'parrilla' where slug = 'bodegon-a';
update public.tenants set business_type = 'bar' where slug = 'esquina-b';
insert into public.tenant_locations (tenant_id, lat, lng, province_code, locality, locality_key, neighborhood, confirmed_at) values
  (tests.tenant_id('bodegon-a'), -31.25, -61.49, 'santa-fe', 'Rafaela', 'rafaela', '', now()),
  (tests.tenant_id('esquina-b'), -34.58, -58.43, 'caba', 'Palermo', 'palermo', '', now());
update public.tenant_moderation set status = 'approved' where tenant_id in (tests.tenant_id('bodegon-a'), tests.tenant_id('esquina-b'));

create or replace function tests.slugs(p jsonb) returns text[] language sql set search_path = '' as
$$ select coalesce(array_agg(i ->> 'slug' order by i ->> 'slug'), '{}') from pg_catalog.jsonb_array_elements(public.explore_search(p) -> 'items') i
   -- El seed de desarrollo trae otros comercios listados: se compara solo con los de esta prueba.
   where i ->> 'slug' in ('bodegon-a', 'esquina-b') $$;
grant execute on function tests.slugs(jsonb) to anon, authenticated;

select tests.as_anon();
select is(tests.slugs('{}'), array['bodegon-a', 'esquina-b'], 'sin filtro aparecen los dos');
select is(tests.slugs('{"with_promotion": true}'), '{}'::text[], 'sin promociones, el filtro no devuelve nada');

select tests.authenticate_as('admin@test.local');
select public.admin_set_promotion(tests.tenant_id('esquina-b'), 'Happy hour', 'De 18 a 20', 7, 'promoción de prueba');

select tests.as_anon();
select is(tests.slugs('{"with_promotion": true}'), array['esquina-b'], 'solo el comercio con promoción vigente');
select is(tests.slugs('{"with_promotion": false}'), array['bodegon-a', 'esquina-b'], 'apagado no filtra');

select tests.as_postgres();
update public.tenant_promotions set starts_at = now() - interval '10 days', ends_at = now() - interval '1 day';
select tests.as_anon();
select is(tests.slugs('{"with_promotion": true}'), '{}'::text[], 'una promoción vencida no cuenta');

select * from finish();
rollback;
