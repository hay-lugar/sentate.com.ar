-- Etapa A: rol de plataforma, moderación, suspensión, visibilidad del explorador y auditoría.
begin;
select plan(20);

select tests.as_postgres();
select tests.seed_two_tenants();
select tests.create_user('admin@test.local');
insert into private.platform_admins (user_id) values (tests.uid('admin@test.local'));

-- Todo comercio nace en borrador; ninguno está listado todavía.
select is((select status::text from public.tenant_moderation where tenant_id = tests.tenant_id('bodegon-a')),
  'draft', 'el comercio nuevo nace en borrador');
select ok(not private.is_listed(tests.tenant_id('bodegon-a')), 'borrador publicado: carta sí, explorador no');
select ok(private.is_publicly_visible(tests.tenant_id('bodegon-a')), 'la carta de un borrador publicado sigue visible');

-- Escalada de privilegios.
select tests.authenticate_as('owner_a@test.local');
select ok(not private.is_platform_admin(), 'user_metadata no otorga rol de plataforma');
select throws_ok($$ insert into private.platform_admins (user_id) values (auth.uid()) $$, '42501', null,
  'nadie se autoasigna rol de plataforma');
select throws_ok($$ select public.admin_review_tenant(tests.tenant_id('bodegon-a'), 'approve', '') $$, '42501', 'forbidden',
  'un dueño no puede moderar');
select throws_ok($$ select public.admin_set_suspension(tests.tenant_id('bodegon-a'), true, 'motivo') $$, '42501', 'forbidden',
  'un dueño no puede suspender');
select throws_ok($$ update public.tenant_moderation set status = 'approved' where tenant_id = tests.tenant_id('bodegon-a') $$,
  '42501', null, 'el dueño no escribe la moderación');

-- Envío a revisión.
select lives_ok($$ select public.submit_for_review(tests.tenant_id('bodegon-a')) $$, 'el dueño envía a revisión');
select throws_ok($$ select public.submit_for_review(tests.tenant_id('esquina-b')) $$, '42501', 'forbidden',
  'no se envía a revisión un comercio ajeno');
select throws_ok($$ select public.submit_for_review(tests.tenant_id('bodegon-a')) $$, 'P0001', 'invalid_moderation_transition',
  'no se reenvía lo que ya está en revisión');

-- Aprobación por superadmin.
select tests.authenticate_as('admin@test.local');
select throws_ok($$ select public.admin_review_tenant(tests.tenant_id('bodegon-a'), 'reject', '') $$, 'P0001', 'reason_required',
  'rechazar exige motivo');
select lives_ok($$ select public.admin_review_tenant(tests.tenant_id('bodegon-a'), 'approve', '') $$, 'el admin aprueba');
select tests.as_postgres();
select ok(private.is_listed(tests.tenant_id('bodegon-a')), 'aprobado + publicado + acceso vigente = listado');

-- Cambio material → vuelve a revisión sin ocultar la carta.
update public.tenants set address = 'Otra calle 123' where id = tests.tenant_id('bodegon-a');
select ok(not private.is_listed(tests.tenant_id('bodegon-a')) and private.is_publicly_visible(tests.tenant_id('bodegon-a')),
  'cambio de dirección: sale del explorador, la carta sigue');

-- Suspensión y rechazo ocultan la carta.
select tests.authenticate_as('admin@test.local');
select lives_ok($$ select public.admin_set_suspension(tests.tenant_id('bodegon-a'), true, 'denuncia') $$, 'el admin suspende');
select tests.as_postgres();
select ok(not private.is_publicly_visible(tests.tenant_id('bodegon-a')), 'suspendido: carta oculta');

-- Prueba vencida: aprobado pero sin acceso operativo no se lista (aunque la carta siga visible).
update public.tenant_moderation set status = 'approved' where tenant_id = tests.tenant_id('esquina-b');
update public.tenant_subscriptions set trial_ends_at = now() - interval '1 day', trial_started_at = now() - interval '31 days'
  where tenant_id = tests.tenant_id('esquina-b');
select ok(not private.is_listed(tests.tenant_id('esquina-b')), 'prueba vencida: fuera del explorador');

-- Auditoría escrita y no legible por clientes.
select cmp_ok((select count(*)::int from private.admin_audit_log), '>=', 3, 'las acciones sensibles quedan auditadas');
select tests.authenticate_as('owner_b@test.local');
select throws_ok($$ select * from private.admin_audit_log $$, '42501', null, 'la auditoría no es legible por clientes');

select * from finish();
rollback;
