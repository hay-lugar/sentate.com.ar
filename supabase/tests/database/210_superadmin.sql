-- Etapa G: superadministración (autorización en la base), suscripciones administradas a mano y destacados.
begin;
select plan(30);

select tests.as_postgres();
select tests.seed_two_tenants();
select tests.create_user('admin@test.local');
insert into private.platform_admins (user_id) values (tests.uid('admin@test.local'));

-- Dos comercios listados (aprobados, con tipo y ubicación) y uno en revisión.
update public.tenants set business_type = 'parrilla' where slug = 'bodegon-a';
update public.tenants set business_type = 'bar' where slug = 'esquina-b';
insert into public.tenant_locations (tenant_id, lat, lng, province_code, locality, locality_key, neighborhood, confirmed_at) values
  (tests.tenant_id('bodegon-a'), -31.25, -61.49, 'santa-fe', 'Rafaela', 'rafaela', '', now()),
  (tests.tenant_id('esquina-b'), -34.58, -58.43, 'caba', 'Palermo', 'palermo', '', now());
update public.tenant_moderation set status = 'approved' where tenant_id in (tests.tenant_id('bodegon-a'), tests.tenant_id('esquina-b'));
update public.tenant_moderation set status = 'pending_review', submitted_at = now() where tenant_id = tests.tenant_id('oculto-u');

create or replace function tests.featured(p jsonb) returns text[] language sql set search_path = '' as
$$ select coalesce(array_agg(i ->> 'slug' order by i ->> 'slug'), '{}') from pg_catalog.jsonb_array_elements(public.explore_search(p) -> 'featured_items') i $$;
grant execute on function tests.featured(jsonb) to anon, authenticated;

-- ── Autorización: solo superadmin, validado en la base ──
select tests.as_anon();
select throws_ok($$ select public.admin_moderation_queue() $$, '42501', null, 'anon no entra a la bandeja');
select tests.authenticate_as('owner_a@test.local');
select throws_ok($$ select public.admin_moderation_queue() $$, '42501', 'forbidden', 'un dueño no entra a la bandeja');
select throws_ok($$ select public.admin_tenant_detail(tests.tenant_id('esquina-b')) $$, '42501', 'forbidden', 'ni a la ficha de otro comercio');
select throws_ok($$ select public.admin_set_subscription(tests.tenant_id('bodegon-a'), 'extend_trial', 365, 'quiero más prueba') $$, '42501', 'forbidden',
  'un comercio no se extiende su prueba');
select throws_ok($$ select public.admin_set_featured(tests.tenant_id('bodegon-a'), 30, 'quiero destacar') $$, '42501', 'forbidden', 'un comercio no se destaca solo');
select is(public.am_i_platform_admin(), false, 'el dueño no es superadministrador');
select throws_ok($$ update public.tenant_subscriptions set status = 'active', current_period_ends_at = now() + interval '1 year' $$, '42501', null,
  'el comercio no escribe el estado de pago');
select throws_ok($$ insert into public.featured_tenants (tenant_id, starts_at, ends_at) values (tests.tenant_id('bodegon-a'), now(), now() + interval '1 day') $$,
  '42501', null, 'ni inserta destacados');

-- ── Bandeja ──
select tests.authenticate_as('admin@test.local');
select is(public.am_i_platform_admin(), true, 'el superadmin se reconoce');
select ok((public.admin_moderation_queue('pending_review') -> 'items' @> '[{"slug": "oculto-u"}]'::jsonb), 'la bandeja lista lo pendiente de revisión');
select is((public.admin_moderation_queue('approved', 'bodegon') -> 'items' -> 0 ->> 'slug'), 'bodegon-a', 'filtra por estado y busca por nombre');
select throws_ok($$ select public.admin_moderation_queue('cualquiera') $$, 'P0001', 'invalid_filter', 'estado inválido rechazado');
select ok((public.admin_tenant_detail(tests.tenant_id('bodegon-a')) -> 'location' ->> 'locality') = 'Rafaela', 'la ficha muestra perfil y ubicación');

-- ── Suscripción administrada a mano ──
select tests.as_postgres();
update public.tenant_subscriptions set trial_ends_at = now() - interval '1 day', trial_started_at = now() - interval '31 days'
  where tenant_id = tests.tenant_id('esquina-b');
select ok(not private.tenant_has_operational_access(tests.tenant_id('esquina-b')), 'prueba vencida: sin acceso operativo');
select tests.authenticate_as('admin@test.local');
select throws_ok($$ select public.admin_set_subscription(tests.tenant_id('esquina-b'), 'extend_trial', 15, '') $$, 'P0001', 'reason_required', 'se exige motivo');
select throws_ok($$ select public.admin_set_subscription(tests.tenant_id('esquina-b'), 'regalar', 15, 'motivo válido') $$, 'P0001', 'invalid_action', 'acción inválida');
select lives_ok($$ select public.admin_set_subscription(tests.tenant_id('esquina-b'), 'extend_trial', 15, 'cortesía de lanzamiento') $$, 'se extiende la prueba');
select tests.as_postgres();
select ok(private.tenant_has_operational_access(tests.tenant_id('esquina-b')), 'tras extender, vuelve el acceso');
select tests.authenticate_as('admin@test.local');
select lives_ok($$ select public.admin_set_subscription(tests.tenant_id('esquina-b'), 'activate', 30, 'transferencia recibida') $$, 'activación manual');
select lives_ok($$ select public.admin_set_subscription(tests.tenant_id('esquina-b'), 'mark_past_due', 0, 'pago vencido') $$, 'queda en mora');
select tests.as_postgres();
select ok(not private.tenant_has_operational_access(tests.tenant_id('esquina-b')), 'en mora: sin acceso operativo');
select is((select count(*)::int from private.admin_audit_log where tenant_id = tests.tenant_id('esquina-b') and action like 'subscription_%'), 3,
  'cada cambio quedó auditado (quién, cuándo, motivo, antes y después)');
select tests.authenticate_as('admin@test.local');
select lives_ok($$ select public.admin_set_subscription(tests.tenant_id('esquina-b'), 'activate', 30, 'regularizó el pago') $$, 'se reactiva');

-- ── Destacados ──
select tests.as_anon();
select is(tests.featured('{}'::jsonb), '{}'::text[], 'por defecto no hay destacados');
select tests.authenticate_as('admin@test.local');
select lives_ok($$ select public.admin_set_featured(tests.tenant_id('bodegon-a'), 30, 'acuerdo comercial piloto') $$, 'el superadmin destaca un comercio');
select tests.as_anon();
select is(tests.featured('{}'::jsonb), array['bodegon-a'], 'aparece en el bloque de destacados');
select is(tests.featured('{"business_types":["bar"]}'::jsonb), '{}'::text[], 'respeta los filtros: fuera del filtro, no se promociona');
select is(tests.featured('{"lat":-34.59,"lng":-58.42,"sort":"distance"}'::jsonb), '{}'::text[], '«Más cercanos» es orgánico: sin destacados');

-- Suspender saca al comercio de los destacados (misma regla de visibilidad que todo el explorador).
select tests.authenticate_as('admin@test.local');
select lives_ok($$ select public.admin_set_suspension(tests.tenant_id('bodegon-a'), true, 'denuncia verificada') $$, 'el superadmin suspende');
select tests.as_anon();
select is(tests.featured('{}'::jsonb), '{}'::text[], 'un comercio suspendido sale de los destacados');

select * from finish();
rollback;
