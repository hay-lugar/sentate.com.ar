-- Consola de superadmin: autorización en la base, administradores, auditoría y ajustes.
begin;
select plan(34);

select tests.as_postgres();
select tests.seed_two_tenants();
select tests.create_user('admin@test.local');
select tests.create_user('admin2@test.local');
insert into private.platform_admins (user_id) values (tests.uid('admin@test.local'));

-- ── Solo superadmin ──
select tests.as_anon();
select throws_ok($$ select public.admin_platform_overview() $$, '42501', null, 'anon no ve el resumen');
select tests.authenticate_as('owner_a@test.local');
select throws_ok($$ select public.admin_platform_overview() $$, '42501', 'forbidden', 'un dueño no ve el resumen');
select throws_ok($$ select public.admin_subscriptions_list() $$, '42501', 'forbidden', 'ni las suscripciones');
select throws_ok($$ select public.admin_audit_log_list() $$, '42501', 'forbidden', 'ni la auditoría');
select throws_ok($$ select public.admin_users_list() $$, '42501', 'forbidden', 'ni los usuarios');
select throws_ok($$ select public.admin_list_admins() $$, '42501', 'forbidden', 'ni los administradores');
select throws_ok($$ select public.admin_add_admin('owner_a@test.local', 'me quiero hacer admin') $$, '42501', 'forbidden', 'nadie se autoasigna el rol');
select throws_ok($$ select public.admin_system_status() $$, '42501', 'forbidden', 'ni el estado del sistema');
select throws_ok($$ select public.admin_set_platform_setting('public_menu_when_access_lapsed', 'hidden', 'quiero cambiarlo') $$, '42501', 'forbidden', 'ni los ajustes');

-- ── Lecturas del superadmin ──
select tests.authenticate_as('admin@test.local');
select ok((public.admin_platform_overview() -> 'tenants' ->> 'total')::int >= 3, 'el resumen cuenta los comercios');
select is(public.admin_users_list('admin@test') -> 'items' -> 0 ->> 'email', 'admin@test.local', 'la búsqueda de usuarios encuentra por email');
select throws_ok($$ select public.admin_subscriptions_list('inventado') $$, 'P0001', 'invalid_filter', 'un filtro inválido se rechaza');
select ok((public.admin_subscriptions_list('all') ->> 'total')::int >= 3, 'las suscripciones se listan');

-- ── Administradores ──
select throws_ok($$ select public.admin_add_admin('admin2@test.local', 'x') $$, 'P0001', 'reason_required', 'el motivo es obligatorio');
select throws_ok($$ select public.admin_add_admin('no-existe@test.local', 'alta de prueba') $$, 'P0001', 'user_not_found', 'solo una cuenta existente');
select ok(public.admin_add_admin('Admin2@test.local', 'segundo administrador') ? 'user_id', 'se agrega un administrador (sin distinguir mayúsculas)');
select throws_ok(format($$ select public.admin_remove_admin(%L, 'prueba de baja propia') $$, tests.uid('admin@test.local')), 'P0001', 'cannot_remove_self', 'no se puede quitar a uno mismo');
select ok((public.admin_remove_admin(tests.uid('admin2@test.local'), 'baja de prueba') ->> 'removed')::boolean, 'se quita a otro administrador');
select throws_ok(format($$ select public.admin_remove_admin(%L, 'baja de prueba') $$, gen_random_uuid()), 'P0001', 'last_admin', 'siempre queda al menos un administrador');

-- ── Ajustes y auditoría ──
select throws_ok($$ select public.admin_set_platform_setting('otra_cosa', 'hidden', 'ajuste inventado') $$, 'P0001', 'invalid_setting', 'solo se cambia el ajuste conocido');
select is(public.admin_set_platform_setting('public_menu_when_access_lapsed', 'hidden', 'decisión de producto') ->> 'value', 'hidden', 'se cambia la visibilidad con acceso vencido');
select ok((public.admin_audit_log_list('setting_changed') ->> 'total')::int = 1 and (public.admin_audit_log_list() -> 'actions') ? 'admin_added', 'todo quedó en la auditoría');

-- ── Alta, promociones y baja de comercios ──
select tests.as_postgres();
select tests.create_user('dueno-nuevo@test.local');
select tests.authenticate_as('owner_a@test.local');
select throws_ok($$ select public.admin_create_tenant('nuevo-local', 'Nuevo Local', null, 'no soy admin') $$, '42501', 'forbidden', 'un dueño no crea comercios ajenos');
select throws_ok(format($$ select public.admin_delete_tenant(%L, 'bodegon-a', 'quiero borrarlo') $$, tests.tenant_id('bodegon-a')), '42501', 'forbidden', 'un dueño no borra comercios por esta vía');
select throws_ok(format($$ select public.admin_set_promotion(%L, 'Promo de prueba', '', 7, 'no soy admin') $$, tests.tenant_id('bodegon-a')), '42501', 'forbidden', 'un dueño no se pone promociones');
select tests.authenticate_as('admin@test.local');
select throws_ok($$ select public.admin_create_tenant('Mal Slug!', 'X', null, 'alta de prueba') $$, 'P0001', 'invalid_slug', 'el slug se valida');
select throws_ok($$ select public.admin_create_tenant('bodegon-a', 'Repetido', null, 'alta de prueba') $$, 'P0001', 'slug_taken', 'no se pisa un slug existente');
select ok(public.admin_create_tenant('nuevo-local', 'Nuevo Local', 'dueno-nuevo@test.local', 'alta pedida por el dueño') ? 'tenant_id', 'la plataforma crea un comercio para un dueño existente');
select tests.as_postgres();
select is((select count(*)::int from public.tenant_members m join public.tenants t on t.id = m.tenant_id where t.slug = 'nuevo-local' and m.user_id = tests.uid('dueno-nuevo@test.local') and m.role = 'owner'), 1, 'el dueño quedó asignado');
select tests.authenticate_as('admin@test.local');
select ok(public.admin_set_promotion(tests.tenant_id('nuevo-local'), '2x1 en pizzas', 'Los martes', 14, 'campaña de lanzamiento') ? 'promotion', 'se pone una promoción');
select is(public.admin_tenant_extras(tests.tenant_id('nuevo-local')) -> 'promotion' ->> 'title', '2x1 en pizzas', 'la ficha ve la promoción');
select throws_ok(format($$ select public.admin_delete_tenant(%L, 'otro-slug', 'confirmación errónea') $$, tests.tenant_id('nuevo-local')), 'P0001', 'slug_mismatch', 'la baja exige el slug exacto');
select ok((public.admin_delete_tenant(tests.tenant_id('nuevo-local'), 'nuevo-local', 'baja de prueba') ->> 'deleted')::boolean
  and not exists (select 1 from public.tenants where slug = 'nuevo-local'), 'la baja borra el comercio y sus datos');
select tests.as_postgres();
select is((select count(*)::int from private.admin_audit_log where action = 'tenant_deleted' and detail ->> 'slug' = 'nuevo-local'), 1, 'la baja queda auditada con el slug');

select * from finish();
rollback;
