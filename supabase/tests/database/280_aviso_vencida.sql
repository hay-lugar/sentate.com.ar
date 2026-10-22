-- PR4 del plan: aviso cuando una solicitud vence sin respuesta (idempotente y solo con consentimiento).
begin;
select plan(4);

select tests.seed_two_tenants();
create temp table ctx as select tests.tenant_id('bodegon-a') as a;

select tests.as_postgres();
insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, status, customer_email, notify_consent, hold_expires_at)
values ((select a from ctx), now() + interval '2 days', (now() + interval '2 days')::date, 2, 'Con Consentimiento', '+54 11 0000-9401', 'pending', 'con@example.test', true, now() + interval '1 hour'),
       ((select a from ctx), now() + interval '2 days', (now() + interval '2 days')::date, 2, 'Sin Email', '+54 11 0000-9402', 'pending', null, false, now() + interval '1 hour');

select is((select count(*)::int from private.notification_outbox where kind = 'reservation_expired'), 0, 'antes de vencer no hay aviso de vencimiento');
update public.reservations set status = 'expired' where customer_name in ('Con Consentimiento', 'Sin Email');
select is((select count(*)::int from private.notification_outbox o join public.reservations r on r.id = o.reservation_id where o.kind = 'reservation_expired' and r.customer_name = 'Con Consentimiento'), 1, 'al vencer se encola el aviso para quien lo pidió');
select is((select count(*)::int from private.notification_outbox o join public.reservations r on r.id = o.reservation_id where o.kind = 'reservation_expired' and r.customer_name = 'Sin Email'), 0, 'sin email ni consentimiento no se encola nada');
select throws_ok($$ update public.reservations set status = 'confirmed' where customer_name = 'Con Consentimiento' $$, '23514', 'invalid_status_transition', 'una solicitud vencida no se reactiva (y no duplica avisos)');

select * from finish();
rollback;
