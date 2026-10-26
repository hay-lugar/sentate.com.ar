-- Auditoría run-1: capacidad privada, local rechazado, tope por destinatario y revisión por cambio de zona.
begin;
select plan(8);

select tests.seed_two_tenants();
create temp table ctx as select tests.tenant_id('bodegon-a') as a, tests.tenant_id('esquina-b') as b;
grant select on ctx to anon, authenticated;

select tests.as_postgres();
insert into public.tenant_reservation_settings (tenant_id, accepts_reservations, capacity_guests) values ((select b from ctx), true, 40)
  on conflict (tenant_id) do update set capacity_guests = 40;
update public.tenant_moderation set status = 'approved' where tenant_id = (select a from ctx);

-- 1) La capacidad no la lee quien no opera el local.
select tests.authenticate_as('owner_a@test.local');
select throws_ok($$ select capacity_guests from public.tenant_reservation_settings $$, '42501', null, 'una cuenta logueada no lee la capacidad (ni la de otros ni la propia por tabla)');
select is((select accepts_reservations from public.tenant_reservation_settings where tenant_id = (select b from ctx)), true, 'sí lee lo público (acepta reservas)');
select throws_ok($$ select public.get_reservation_settings((select b from ctx)) $$, '42501', 'forbidden', 'el RPC de lectura completa exige ser del local');
select lives_ok($$ select public.get_reservation_settings((select a from ctx)) $$, 'el dueño sí puede pedir la configuración de su local');
select is((public.save_reservation_settings((select a from ctx), '{"capacity_guests": 25}'::jsonb) ->> 'capacity_guests')::int, 25, 'el dueño guarda su capacidad');

-- 2) Local rechazado: no recibe solicitudes.
select tests.as_postgres();
update public.tenant_moderation set status = 'rejected' where tenant_id = (select a from ctx);
select throws_ok($$ insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, status)
  values ((select a from ctx), now() + interval '2 days', (now() + interval '2 days')::date, 2, 'Rechazado', '+541100009501', 'pending') $$,
  'P0001', 'tenant_unavailable', 'un local rechazado no acepta solicitudes');

-- 3) Tope de avisos por destinatario.
update public.tenant_moderation set status = 'approved' where tenant_id = (select a from ctx);
insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, status, customer_email, notify_consent, hold_expires_at)
select (select a from ctx), now() + interval '2 days', (now() + interval '2 days')::date, 2, 'Victima ' || g, '+5411000' || lpad((9600 + g)::text, 5, '0'), 'pending', 'victima@example.test', true, now() + interval '1 hour'
from generate_series(1, 9) g;
select is((select count(*)::int from private.notification_outbox where recipient = 'victima@example.test'), 6, 'una misma dirección recibe como máximo 6 avisos por día');

-- 4) Cambiar de localidad un local aprobado lo devuelve a revisión.
insert into public.tenant_locations (tenant_id, lat, lng, province_code, locality, locality_key, confirmed_at)
select (select a from ctx), -34.6037, -58.3816, p.code, 'Ciudad', 'ciudad', now() from public.provinces p limit 1
on conflict (tenant_id) do nothing;
update public.tenant_moderation set status = 'approved' where tenant_id = (select a from ctx);
update public.tenant_locations set locality_key = 'otra-ciudad', locality = 'Otra ciudad' where tenant_id = (select a from ctx);
select is((select status::text from public.tenant_moderation where tenant_id = (select a from ctx)), 'pending_review', 'cambiar la localidad devuelve el local a revisión');

select * from finish();
rollback;
