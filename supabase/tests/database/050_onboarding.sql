-- Alta del comercio: atómica, identidad desde auth.uid(), reintentos idempotentes.
begin;
select plan(13);
select tests.create_user('nuevo@test.local');
select tests.create_user('otro@test.local');

select tests.as_anon();
select throws_ok($$ select public.create_tenant('anonimo', 'Anónimo') $$, '42501', null, 'sin sesión no hay alta');

select tests.authenticate_as('nuevo@test.local');
select is((public.create_tenant('mi-local', 'Mi Local') ->> 'created')::boolean, true, 'alta creada');
select results_eq($$ select role::text from public.tenant_members where tenant_id = tests.tenant_id('mi-local') $$,
  array['owner'], 'membresía owner para el usuario autenticado');
select results_eq($$ select user_id from public.tenant_members where tenant_id = tests.tenant_id('mi-local') $$,
  array[tests.uid('nuevo@test.local')], 'el owner es auth.uid(), no un parámetro');
select ok((select status = 'trialing' and trial_ends_at between now() + interval '30 days' - interval '1 minute'
             and now() + interval '30 days' + interval '1 minute'
           from public.tenant_subscriptions where tenant_id = tests.tenant_id('mi-local')),
  'prueba de 30 días calculada en el servidor');
select ok(not (select is_published from public.tenants where slug = 'mi-local'), 'nace sin publicar');

select is((public.create_tenant('mi-local', 'Mi Local') ->> 'created')::boolean, false,
  'reintento con mismo slug y usuario: no duplica');
select is((select count(*)::int from public.tenant_members where user_id = tests.uid('nuevo@test.local')), 1,
  'el reintento no crea otra membresía');

select tests.authenticate_as('otro@test.local');
select throws_ok($$ select public.create_tenant('mi-local', 'Copia') $$, 'P0001', 'slug_taken', 'slug ajeno: rechazado');
select throws_ok($$ select public.create_tenant('admin', 'Reservado') $$, 'P0001', 'invalid_slug', 'slug reservado');
select throws_ok($$ select public.create_tenant('Mal Slug!', 'X') $$, 'P0001', 'invalid_slug', 'slug no normalizado');

-- Atomicidad: si falla un paso posterior (simulado), no queda ni el comercio ni la membresía.
select tests.as_postgres();
create function tests.fail_subscription() returns trigger language plpgsql as $$
begin raise exception 'falla simulada'; end $$;
create trigger fail_subscription before insert on public.tenant_subscriptions
  for each row execute function tests.fail_subscription();
select tests.authenticate_as('otro@test.local');
select throws_ok($$ select public.create_tenant('a-medias', 'A medias') $$, null, null, 'el alta falla al crear la prueba');
select tests.as_postgres();
select ok(not exists (select 1 from public.tenants where slug = 'a-medias')
          and not exists (select 1 from public.tenant_members where user_id = tests.uid('otro@test.local')),
  'sin estados parciales: ni comercio ni membresía');

select * from finish();
rollback;
