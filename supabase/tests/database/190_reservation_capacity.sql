-- Etapa E: capacidad, ocupación solapada, retención de pendientes, bloqueos, vencimiento y revalidación al confirmar.
begin;
select plan(30);

select tests.seed_two_tenants();
create temp table ctx as
select tests.tenant_id('bodegon-a') as a, tests.tenant_id('esquina-b') as b, tests.next_service_date(4) as d;
grant select on ctx to anon, authenticated;

-- Pedido público: devuelve el id o el código de error.
create or replace function tests.req(p_guests int, p_time time, p_n int) returns text language plpgsql set search_path = '' as $$
begin
  return (public.request_reservation((select a from pg_temp.ctx), (select d from pg_temp.ctx), p_time, p_guests,
    'Comensal ' || p_n, '+54 11 0000-' || lpad(p_n::text, 4, '0'), '', gen_random_uuid()) ->> 'reservation_id');
exception when others then
  return 'ERR:' || sqlerrm;
end $$;
grant execute on function tests.req(int, time, int) to anon, authenticated;

-- ── Sin configuración: sin tope (comportamiento anterior) y disponibilidad informativa ──
select tests.as_anon();
select is((public.reservation_availability((select a from ctx), (select d from ctx), 2) -> 'slots' -> 0 ->> 'available')::boolean, true,
  'sin capacidad configurada, los horarios están disponibles');
select is((public.reservation_availability((select a from ctx), (select d from ctx), 2) ->> 'closed_reason'), null,
  'un día con atención no trae motivo de cierre');
select is((public.reservation_availability((select a from ctx), (select d from ctx) + 30, 2) ->> 'closed_reason'), 'date_out_of_range',
  'fuera de la ventana: sin horarios y con motivo');

-- ── Configuración del dueño ──
select tests.authenticate_as('owner_a@test.local');
select lives_ok($$ select public.save_reservation_settings((select a from ctx), '{"capacity_guests":10,"occupancy_minutes":90,"slot_interval_minutes":30}'::jsonb) $$,
  'el dueño configura la capacidad');
select throws_ok($$ select public.save_reservation_settings((select a from ctx), '{"slot_interval_minutes":20}'::jsonb) $$, '23514', null,
  'el intervalo debe ser 15, 30 o 60');
select throws_ok($$ select public.save_reservation_settings((select b from ctx), '{"capacity_guests":5}'::jsonb) $$, '42501', 'forbidden',
  'no se configura un comercio ajeno');

select tests.as_anon();
select throws_ok($$ select capacity_guests from public.tenant_reservation_settings $$, '42501', null, 'el público no ve la capacidad');

-- ── Capacidad con ocupación solapada ──
select ok(tests.req(6, '21:00', 1) not like 'ERR:%', '6 de 10: entra');
select is(tests.req(6, '21:00', 2), 'ERR:slot_full', 'otros 6 ya no entran en el mismo horario');
select ok(tests.req(4, '21:00', 3) not like 'ERR:%', '4 más completan los 10');
select is(tests.req(1, '21:00', 4), 'ERR:slot_full', 'ni uno más');
select is(tests.req(1, '22:00', 5), 'ERR:slot_full', 'solapado: a las 22:00 las reservas de las 21:00 siguen ocupando');
select ok(tests.req(2, '22:30', 6) not like 'ERR:%', 'a las 22:30 la ocupación de las 21:00 terminó');
select is((public.reservation_availability((select a from ctx), (select d from ctx), 2) -> 'slots') @> '[{"time":"21:00","available":false,"reason":"slot_full"}]'::jsonb,
  true, 'la disponibilidad informa el horario completo');
select is(tests.req(9, '21:00', 7), 'ERR:invalid_guests', 'más del máximo de grupo');

-- ── Liberación: rechazar libera el cupo ──
select tests.as_postgres();
update public.reservations set status = 'rejected' where customer_name = 'Comensal 1';
select tests.as_anon();
select ok(tests.req(6, '21:00', 8) not like 'ERR:%', 'al rechazar una solicitud, su cupo se libera');

-- ── Retención de pendientes: vence sola y no depende de ningún cron ──
select tests.as_postgres();
update public.reservations set hold_expires_at = now() - interval '1 minute' where customer_name = 'Comensal 3';
select tests.as_anon();
select ok(tests.req(4, '21:00', 9) not like 'ERR:%', 'una retención vencida ya no ocupa (aunque siga marcada pendiente)');
select tests.as_postgres();
select is((select status::text from public.reservations where customer_name = 'Comensal 3'), 'expired',
  'el pedido siguiente marca como vencida la retención caducada');

-- ── Confirmar: una retención vencida se revalida como pedido nuevo ──
update public.reservations set status = 'pending', hold_expires_at = now() - interval '1 minute'
  where customer_name = 'Comensal 6';
select tests.authenticate_as('owner_a@test.local');
select lives_ok($$ update public.reservations set status = 'confirmed' where customer_name = 'Comensal 6' $$,
  'confirmar con retención vencida pero cupo libre: se puede');
select throws_ok($$ update public.reservations set status = 'expired' where customer_name = 'Comensal 8' $$, '23514', 'invalid_status_transition',
  'un cliente no marca vencimientos');
select tests.as_postgres();
insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, status)
values ((select a from ctx), ((select d from ctx) + time '21:00') at time zone 'America/Argentina/Buenos_Aires', (select d from ctx), 2,
        'Relleno', '+54 11 0000-9100', 'confirmed');
update public.reservations set hold_expires_at = now() - interval '1 minute' where customer_name = 'Comensal 9';
select tests.authenticate_as('owner_a@test.local');
select throws_ok($$ update public.reservations set status = 'confirmed' where customer_name = 'Comensal 9' $$, '23514', 'capacity_exceeded',
  'confirmar una retención vencida sin cupo se rechaza (el cupo lo tomó otra solicitud)');

-- ── Bloqueos ──
select lives_ok(format($$ select public.add_reservation_block(%L, %L, '23:00', '23:59', 'Evento privado') $$, (select a from ctx), (select d from ctx)),
  'el dueño bloquea un horario');
select tests.as_anon();
select is(tests.req(2, '23:00', 10), 'ERR:slot_blocked', 'un horario bloqueado no se reserva');

-- ── Cambiar la configuración no toca lo ya reservado ──
select tests.authenticate_as('owner_a@test.local');
select lives_ok($$ select public.save_reservation_settings((select a from ctx), '{"capacity_guests":4}'::jsonb) $$, 'baja la capacidad con reservas futuras');
select tests.as_postgres();
select cmp_ok((select count(*)::int from public.reservations where status in ('pending', 'confirmed') and customer_name like 'Comensal %'), '>', 0,
  'las reservas existentes siguen en pie (nada se cancela solo)');
select tests.as_anon();
select is(tests.req(2, '21:00', 11), 'ERR:slot_full', 'las nuevas ven la ocupación existente con el nuevo tope');

-- ── Local que no acepta reservas ──
select tests.authenticate_as('owner_a@test.local');
select public.save_reservation_settings((select a from ctx), '{"accepts_reservations":false}'::jsonb);
select tests.as_anon();
select is(tests.req(2, '21:00', 12), 'ERR:reservations_closed', 'sin reservas habilitadas no se aceptan pedidos');
select is((public.reservation_availability((select a from ctx), (select d from ctx), 2) ->> 'closed_reason'), 'reservations_closed',
  'la disponibilidad lo informa');

-- ── Finalizar ──
select tests.as_postgres();
insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, status)
values ((select a from ctx), now() - interval '3 hours', (now() - interval '3 hours')::date, 2, 'Pasada Finalizable', '+54 11 0000-9001', 'confirmed'),
       ((select a from ctx), now() + interval '2 days', (now() + interval '2 days')::date, 2, 'Futura', '+54 11 0000-9002', 'confirmed');
select tests.authenticate_as('owner_a@test.local');
select lives_ok($$ update public.reservations set status = 'finished' where customer_name = 'Pasada Finalizable' $$, 'una reserva cumplida se finaliza');
select throws_ok($$ update public.reservations set status = 'finished' where customer_name = 'Futura' $$, '23514', 'invalid_status_transition',
  'no se finaliza una reserva futura');

select * from finish();
rollback;
