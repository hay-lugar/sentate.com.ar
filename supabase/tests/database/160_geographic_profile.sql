-- Etapa B: perfil geográfico, catálogos, contrato público de ubicación y requisitos de listado.
begin;
select plan(21);

select tests.as_postgres();
select tests.seed_two_tenants();
select tests.create_user('admin@test.local');
insert into private.platform_admins (user_id) values (tests.uid('admin@test.local'));

-- Catálogos públicos.
select tests.as_anon();
select cmp_ok((select count(*)::int from public.provinces), '=', 24, 'anon lee las 24 jurisdicciones');
select cmp_ok((select count(*)::int from public.business_types), '>', 5, 'anon lee tipos de comercio');
select throws_ok($$ insert into public.cuisines (code, label) values ('x', 'X') $$, '42501', null, 'anon no escribe catálogos');

-- Escrituras directas bloqueadas.
select tests.authenticate_as('owner_a@test.local');
select throws_ok($$ insert into public.tenant_locations (tenant_id, lat, lng, province_code, locality, locality_key)
  values (tests.tenant_id('bodegon-a'), -31, -61, 'santa-fe', 'Rafaela', 'rafaela') $$, '42501', null,
  'el dueño no inserta ubicaciones directamente');
select throws_ok($$ select confirmed_by from public.tenant_locations $$, '42501', null,
  'confirmed_by no es parte del contrato público');

-- Validaciones.
select throws_ok($$ select public.save_explorer_profile(tests.tenant_id('bodegon-a'), '{"lat":10,"lng":-61,"province_code":"santa-fe","locality":"Rafaela"}'::jsonb) $$,
  'P0001', 'invalid_coordinates', 'coordenadas fuera de Argentina rechazadas');
select throws_ok($$ select public.save_explorer_profile(tests.tenant_id('bodegon-a'), '{"lat":-31,"lng":-61,"province_code":"narnia","locality":"Rafaela"}'::jsonb) $$,
  'P0001', 'invalid_province', 'provincia inexistente rechazada');
select throws_ok($$ select public.save_explorer_profile(tests.tenant_id('bodegon-a'), '{"business_type":"nave-espacial"}'::jsonb) $$,
  'P0001', 'invalid_business_type', 'tipo inexistente rechazado');
select throws_ok($$ select public.save_explorer_profile(tests.tenant_id('bodegon-a'), '{"cuisines":["pizza","pastas","italiana","vegana"]}'::jsonb) $$,
  'P0001', 'invalid_cuisines', 'máximo 3 cocinas');
select throws_ok($$ select public.save_explorer_profile(tests.tenant_id('bodegon-a'), '{"instagram_url":"http://x.com/a"}'::jsonb) $$,
  '23514', null, 'enlaces de redes validados');
select throws_ok($$ select public.save_explorer_profile(tests.tenant_id('esquina-b'), '{"business_type":"bar"}'::jsonb) $$,
  '42501', 'forbidden', 'no se edita el perfil de otro comercio');

-- Guardado atómico y faltantes.
select is((select public.save_explorer_profile(tests.tenant_id('bodegon-a'),
  '{"business_type":"parrilla","cuisines":["parrilla","argentina"],"address":"Calle 1","province_code":"santa-fe","locality":"Rafaela","lat":-31.25,"lng":-61.49}'::jsonb) -> 'missing'),
  '["location"]'::jsonb, 'sin confirmar el pin la ubicación sigue faltando');
select is((select public.tenant_profile_missing(tests.tenant_id('bodegon-a'))), array['location'], 'faltantes visibles para el dueño');
select throws_ok($$ select public.tenant_profile_missing(tests.tenant_id('esquina-b')) $$, '42501', 'forbidden',
  'los faltantes de otro comercio no se consultan');
select is((select public.save_explorer_profile(tests.tenant_id('bodegon-a'), '{"confirm":true,"lat":-31.25,"lng":-61.49}'::jsonb) -> 'missing'),
  '[]'::jsonb, 'confirmado el pin el perfil queda completo');

-- Aprobación → listado; el público solo ve la ubicación de listados.
select public.submit_for_review(tests.tenant_id('bodegon-a'));
select tests.authenticate_as('admin@test.local');
select public.admin_review_tenant(tests.tenant_id('bodegon-a'), 'approve', '');
select tests.as_anon();
select is((select count(*)::int from public.tenant_locations where tenant_id = tests.tenant_id('bodegon-a')), 1, 'anon ve la ubicación del comercio listado');
select is((select count(*)::int from public.tenant_cuisines where tenant_id = tests.tenant_id('bodegon-a')), 2, 'anon ve las cocinas del comercio listado');

-- Mover el pin >200 m: vuelve a revisión y desaparece del público; la carta sigue.
select tests.authenticate_as('owner_a@test.local');
select public.save_explorer_profile(tests.tenant_id('bodegon-a'), '{"lat":-31.26,"lng":-61.49,"confirm":true}'::jsonb);
select tests.as_anon();
select is((select count(*)::int from public.tenant_locations where tenant_id = tests.tenant_id('bodegon-a')), 0, 'tras mover el pin deja de ser público hasta nueva aprobación');
select is((select count(*)::int from public.tenants where slug = 'bodegon-a'), 1, 'la carta sigue visible');

-- Mover sin confirmar deja la ubicación sin confirmar.
select tests.as_postgres();
update public.tenant_moderation set status = 'approved' where tenant_id = tests.tenant_id('bodegon-a');
select tests.authenticate_as('owner_a@test.local');
select public.save_explorer_profile(tests.tenant_id('bodegon-a'), '{"lat":-31.2601,"lng":-61.4901}'::jsonb);
select tests.as_postgres();
select ok(not private.is_listed(tests.tenant_id('bodegon-a')), 'pin movido sin confirmar: no se lista');

select is(private.normalize_text('  Rafaéla  '), 'rafaela', 'normalización sin tildes ni mayúsculas');

select * from finish();
rollback;
