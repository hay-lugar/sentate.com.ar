-- La prueba vencida bloquea la operación aunque el estado almacenado siga en 'trialing'.
begin;
select plan(13);
select tests.seed_two_tenants();

select tests.as_postgres();
update public.tenant_subscriptions set trial_started_at = now() - interval '31 days', trial_ends_at = now() - interval '1 second'
where tenant_id = tests.tenant_id('bodegon-a');

select tests.authenticate_as('owner_a@test.local');
select results_eq($$ select status::text from public.tenant_subscriptions $$, array['trialing'],
  'el estado guardado todavía dice trialing');
select is((select count(*)::int from public.reservations), 0, 'vencida: no lee reservas');
select is_empty($$ update public.menu_items set price = 1 where tenant_id = tests.tenant_id('bodegon-a') returning id $$,
  'vencida: no edita platos');
select throws_ok(format($$ insert into public.categories (tenant_id, name) values (%L, 'Nueva') $$, tests.tenant_id('bodegon-a')),
  '42501', null, 'vencida: no crea categorías');
select is_empty($$ update public.tenants set name = 'X' where id = tests.tenant_id('bodegon-a') returning id $$,
  'vencida: no edita la información del comercio');
select results_eq($$ select slug from public.tenants where id = tests.tenant_id('bodegon-a') $$, array['bodegon-a'],
  'vencida: conserva acceso a su cuenta (lee su comercio)');
select is((select count(*)::int from public.tenant_subscriptions), 1, 'vencida: puede ver su suscripción');

select tests.as_anon();
select throws_ok(format($$ select public.request_reservation(%L, %L, '13:00', 2, 'Ana', '11 5555 1234', '', gen_random_uuid()) $$,
  tests.tenant_id('bodegon-a'), tests.next_service_date(3)), 'P0001', 'tenant_unavailable', 'vencida: no recibe solicitudes');
select ok(exists (select 1 from public.tenants where slug = 'bodegon-a'),
  'decisión pendiente (valor actual "visible"): la carta sigue pública');

select tests.as_postgres();
update private.settings set public_menu_when_access_lapsed = 'hidden';
select tests.as_anon();
select ok(not exists (select 1 from public.tenants where slug = 'bodegon-a'), 'con "hidden" la carta se oculta');
select ok(exists (select 1 from public.tenants where slug = 'esquina-b'), 'y no afecta a comercios con acceso vigente');

-- Suscripción paga: activa con período vigente opera; con período vencido se bloquea.
select tests.as_postgres();
update public.tenant_subscriptions set status = 'active', current_period_ends_at = now() + interval '20 days'
where tenant_id = tests.tenant_id('bodegon-a');
select tests.authenticate_as('owner_a@test.local');
select is((select count(*)::int from public.reservations), 2, 'activa con período vigente: opera');
select tests.as_postgres();
update public.tenant_subscriptions set current_period_ends_at = now() - interval '1 minute'
where tenant_id = tests.tenant_id('bodegon-a');
select tests.authenticate_as('owner_a@test.local');
select is((select count(*)::int from public.reservations), 0, 'activa con período vencido: bloqueada');

select * from finish();
rollback;
