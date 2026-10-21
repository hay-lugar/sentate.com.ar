-- Etapa D: reservas vinculadas a la sesión, historial, cancelación, favoritos, perfil y baja de cuenta.
begin;
select plan(38);

select tests.seed_two_tenants();
select tests.create_user('diner1@test.local');
select tests.create_user('diner2@test.local');

create temp table ctx as
select tests.tenant_id('bodegon-a') as tenant_a, tests.tenant_id('oculto-u') as tenant_hidden,
       tests.next_service_date(4) as d;
grant select on ctx to anon, authenticated;

-- ── Vínculo con la sesión ──
select tests.as_anon();
create temp table guest as
select public.request_reservation((select tenant_a from ctx), (select d from ctx), '21:00', 2, 'Invitado Sin Cuenta', '+54 11 0000-5001', '', gen_random_uuid()) as res;
grant select on guest to authenticated;

select tests.authenticate_as('diner1@test.local');
create temp table mine as
select public.request_reservation((select tenant_a from ctx), (select d from ctx), '21:30', 3, 'Diner Uno', '+54 11 0000-5002', 'Ventana', gen_random_uuid()) as res;
grant select on mine to authenticated;

select tests.as_postgres();
select is((select user_id from public.reservations where id = (select (res ->> 'reservation_id')::uuid from guest)), null,
  'la solicitud sin cuenta sigue funcionando y queda sin vínculo');
select is((select user_id from public.reservations where id = (select (res ->> 'reservation_id')::uuid from mine)),
  tests.uid('diner1@test.local'), 'con sesión, la reserva queda vinculada a quien la pidió');
select is((select count(*)::int from public.reservations where user_id = tests.uid('diner1@test.local')), 1,
  'no se vinculan reservas por teléfono escrito (la del invitado sigue ajena)');

-- ── Historial: solo el propio ──
select tests.authenticate_as('diner1@test.local');
select is((public.my_reservations() ->> 'total')::int, 1, 'el comensal ve su historial');
select is((public.my_reservations() -> 'items' -> 0 ->> 'display_status'), 'pending', 'estado visible: pendiente');
select is((public.my_reservations() -> 'items' -> 0 -> 'tenant' ->> 'name'), 'Bodegón A', 'incluye el comercio');
select is((public.my_reservations() -> 'items' -> 0 ->> 'can_cancel')::boolean, true, 'una pendiente futura se puede retirar');
select is((select count(*)::int from public.reservations), 0, 'el rol comensal no lee la tabla de reservas');
select is((with u as (update public.reservations set status = 'confirmed' returning 1) select count(*)::int from u), 0,
  'un comensal no confirma reservas (RLS no le deja filas)');

select tests.authenticate_as('diner2@test.local');
select is((public.my_reservations() ->> 'total')::int, 0, 'otro comensal no ve historial ajeno');
select is((public.my_reservations((select (res ->> 'reservation_id')::uuid from mine)) ->> 'total')::int, 0,
  'ni siquiera conociendo el id de otra reserva');
select throws_ok(format($$ select public.cancel_my_reservation(%L) $$, (select res ->> 'reservation_id' from mine)),
  'P0001', 'not_found', 'no se cancela una reserva ajena (responde como inexistente)');

select tests.as_anon();
select throws_ok($$ select public.my_reservations() $$, '42501', null, 'anon no accede al historial');

-- ── Cancelación y reglas del comercio ──
select tests.as_postgres();
insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, status, user_id) values
  ((select tenant_a from ctx), now() + interval '1 hour', (now() + interval '1 hour')::date, 2, 'Cerca Uno', '+54 11 0000-5003', 'confirmed', tests.uid('diner1@test.local')),
  ((select tenant_a from ctx), now() + interval '5 days', (now() + interval '5 days')::date, 2, 'Lejos Uno', '+54 11 0000-5004', 'confirmed', tests.uid('diner1@test.local')),
  ((select tenant_a from ctx), now() - interval '2 days', (now() - interval '2 days')::date, 2, 'Pasada Uno', '+54 11 0000-5005', 'confirmed', tests.uid('diner1@test.local')),
  ((select tenant_a from ctx), now() - interval '2 days', (now() - interval '2 days')::date, 2, 'Sin Respuesta', '+54 11 0000-5006', 'pending', tests.uid('diner1@test.local'));
create temp table ids as select id, customer_name from public.reservations where user_id = tests.uid('diner1@test.local');
grant select on ids to authenticated;
select tests.authenticate_as('diner1@test.local');

select throws_ok(format($$ select public.cancel_my_reservation(%L) $$, (select id from ids where customer_name = 'Cerca Uno')),
  'P0001', 'cancel_too_late', 'confirmada dentro del plazo del comercio: no se cancela desde la app');
select lives_ok(format($$ select public.cancel_my_reservation(%L) $$, (select id from ids where customer_name = 'Lejos Uno')),
  'confirmada con anticipación suficiente: se cancela');
select throws_ok(format($$ select public.cancel_my_reservation(%L) $$, (select id from ids where customer_name = 'Pasada Uno')),
  'P0001', 'cannot_cancel', 'una reserva pasada no se cancela');
select lives_ok(format($$ select public.cancel_my_reservation(%L) $$, (select res ->> 'reservation_id' from mine)),
  'una solicitud pendiente se retira');
select throws_ok(format($$ select public.cancel_my_reservation(%L) $$, (select res ->> 'reservation_id' from mine)),
  'P0001', 'cannot_cancel', 'no se cancela dos veces');

select tests.as_postgres();
create or replace function tests.disp(p_name text) returns text language sql set search_path = '' as
$$ select x ->> 'display_status' from pg_catalog.jsonb_array_elements(public.my_reservations(null, 100, 0) -> 'items') x
   where (x ->> 'id') = (select i.id::text from pg_temp.ids i where i.customer_name = p_name) $$;
grant execute on function tests.disp(text) to authenticated;
select tests.authenticate_as('diner1@test.local');
select is(tests.disp('Lejos Uno'), 'cancelled', 'el historial muestra Cancelada');
select is(tests.disp('Pasada Uno'), 'finished', 'confirmada ya pasada: Finalizada');
select is(tests.disp('Sin Respuesta'), 'expired', 'pendiente que nadie respondió y ya pasó: Sin respuesta');
select is(tests.disp('Cerca Uno'), 'confirmed', 'confirmada próxima: Confirmada');

select tests.as_postgres();
select is((select status::text from public.reservations where id = (select (res ->> 'reservation_id')::uuid from mine)), 'cancelled',
  'el comercio ve la cancelación en su panel');

-- ── Favoritos ──
select tests.authenticate_as('diner1@test.local');
select lives_ok(format($$ select public.set_favorite(%L, true) $$, (select tenant_a from ctx)), 'marca un favorito');
select throws_ok(format($$ select public.set_favorite(%L, true) $$, (select tenant_hidden from ctx)), 'P0001', 'tenant_unavailable',
  'no se marca un comercio que no es visible');
select is(jsonb_array_length(public.my_favorites()), 1, 'lista sus favoritos');
select throws_ok(format($$ insert into public.favorites (user_id, tenant_id) values (auth.uid(), %L) $$, (select tenant_hidden from ctx)),
  '42501', null, 'no se inserta directo (sin pasar por la regla de visibilidad)');
select tests.authenticate_as('diner2@test.local');
select is(jsonb_array_length(public.my_favorites()), 0, 'los favoritos son privados');
select tests.as_postgres();
update public.tenants set is_published = false where id = (select tenant_a from ctx);
select tests.authenticate_as('diner1@test.local');
select is(jsonb_array_length(public.my_favorites()), 0, 'un comercio que deja de ser visible sale de la lista');

-- ── Perfil ──
select lives_ok($$ insert into public.diner_profiles (user_id, display_name, phone) values (auth.uid(), 'Diner Uno', '+54 11 0000-5002') $$,
  'crea su perfil');
select throws_ok(format($$ insert into public.diner_profiles (user_id, display_name) values (%L, 'Intruso') $$, tests.uid('diner2@test.local')),
  '42501', null, 'no crea el perfil de otra persona');
select throws_ok($$ update public.diner_profiles set phone = 'abc' $$, '23514', null, 'teléfono inválido rechazado');

-- ── Una persona puede ser comensal y dueña sin mezclar permisos ──
select tests.authenticate_as('owner_a@test.local');
select ok((select count(*) from public.reservations) > 0, 'el dueño sigue operando las reservas de su comercio');
select is((public.my_reservations() ->> 'total')::int, 0, 'su historial de comensal es aparte');

-- ── Baja de cuenta ──
select throws_ok($$ select public.delete_my_account() $$, 'P0001', 'account_has_responsibilities', 'quien opera un comercio no se da de baja así');
select tests.authenticate_as('diner1@test.local');
select lives_ok($$ select public.delete_my_account() $$, 'el comensal se da de baja');
select tests.as_postgres();
select is((select count(*)::int from auth.users where email = 'diner1@test.local'), 0, 'la cuenta ya no existe');
select is((select count(*)::int from public.reservations where customer_name = 'Diner Uno' and user_id is null), 1,
  'la reserva queda en el comercio, sin vínculo con la persona');

select * from finish();
rollback;
