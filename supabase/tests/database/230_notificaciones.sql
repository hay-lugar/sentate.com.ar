-- Notificaciones: outbox idempotente, consentimiento, privacidad y despachador sin claves privilegiadas.
begin;
select plan(24);

select tests.seed_two_tenants();
select tests.create_user('diner@test.local');
create temp table ctx as select tests.tenant_id('bodegon-a') as a, tests.next_service_date(4) as d;
grant select on ctx to anon, authenticated;

create or replace function tests.req(p_n int, p_email text, p_consent boolean) returns text language plpgsql set search_path = '' as $$
begin
  return (public.request_reservation((select a from pg_temp.ctx), (select d from pg_temp.ctx), '21:00', 2, 'Comensal ' || p_n,
    '+5411000' || lpad(p_n::text, 5, '0'), '', gen_random_uuid(), p_email, p_consent) ->> 'reservation_id');
exception when others then return 'ERR:' || sqlerrm;
end $$;
grant execute on function tests.req(int, text, boolean) to anon, authenticated;

select tests.as_anon();
create temp table r1 as select tests.req(1, 'Ana@Example.com', true) as id;
create temp table r2 as select tests.req(2, 'sin-consentimiento@example.com', false) as id;
create temp table r3 as select tests.req(3, null, false) as id;
select is(tests.req(4, 'no-es-un-email', true), 'ERR:invalid_email', 'un email inválido se rechaza');

select tests.as_postgres();
select is((select customer_email from public.reservations where id = (select id::uuid from r1)), 'ana@example.com', 'con consentimiento se guarda (normalizado)');
select is((select customer_email from public.reservations where id = (select id::uuid from r2)), null, 'sin consentimiento el email se descarta');
select is((select count(*)::int from private.notification_outbox where reservation_id = (select id::uuid from r1) and kind = 'reservation_received'), 1, 'la solicitud con consentimiento encola «recibida»');
select is((select count(*)::int from private.notification_outbox where reservation_id in (select id::uuid from r2 union all select id::uuid from r3)), 0, 'sin email o sin consentimiento no se encola nada');
select is((select payload ->> 'first_name' from private.notification_outbox where reservation_id = (select id::uuid from r1)), 'Comensal', 'el aviso lleva solo datos mínimos');
select ok(not (select payload::text ~* '(@example|541100000001)' from private.notification_outbox where reservation_id = (select id::uuid from r1)), 'el payload no incluye teléfono ni email');

-- Cambios de estado.
select tests.authenticate_as('owner_a@test.local');
update public.reservations set status = 'confirmed' where id = (select id::uuid from r1);
select tests.as_postgres();
select is((select count(*)::int from private.notification_outbox where reservation_id = (select id::uuid from r1) and kind = 'reservation_confirmed'), 1, 'confirmar encola el aviso');
select tests.authenticate_as('owner_a@test.local');
update public.reservations set status = 'cancelled' where id = (select id::uuid from r1);
select tests.as_postgres();
select is((select count(*)::int from private.notification_outbox where reservation_id = (select id::uuid from r1) and kind = 'reservation_cancelled'), 1, 'cancelar el local encola el aviso');
select is((select count(*)::int from private.notification_outbox where reservation_id = (select id::uuid from r1)), 3, 'cada aviso se encola una sola vez');

-- Cancelación del propio comensal: no genera aviso.
select tests.as_postgres();
select tests.create_user('diner2@test.local');
update public.reservations set user_id = tests.uid('diner2@test.local'), customer_email = 'diner2@example.com', notify_consent = true where id = (select id::uuid from r3);
select tests.authenticate_as('diner2@test.local');
select public.cancel_my_reservation((select id::uuid from r3));
select tests.as_postgres();
select is((select count(*)::int from private.notification_outbox where reservation_id = (select id::uuid from r3) and kind = 'reservation_cancelled'), 0, 'quien cancela su reserva no recibe un aviso de eso');

-- Privacidad.
select tests.as_anon();
select throws_ok($$ select * from private.notification_outbox $$, '42501', null, 'el público no lee la cola');
select tests.authenticate_as('owner_a@test.local');
select throws_ok($$ select * from private.notification_outbox $$, '42501', null, 'ni un dueño');

-- Despachador: sin secreto configurado nadie reclama avisos.
select tests.as_anon();
select throws_ok($$ select public.claim_notifications('cualquiera', 10) $$, '42501', 'forbidden', 'sin secreto configurado no hay acceso');
select tests.as_postgres();
update private.settings set notification_worker_secret_sha256 = encode(extensions.digest('secreto-de-prueba', 'sha256'), 'hex');
select tests.as_anon();
select throws_ok($$ select public.claim_notifications('otro-secreto', 10) $$, '42501', 'forbidden', 'un secreto incorrecto se rechaza');
select throws_ok($$ select public.claim_notifications('', 10) $$, '42501', 'forbidden', 'un secreto vacío se rechaza');
create temp table claimed as select public.claim_notifications('secreto-de-prueba', 10) as rows;
select is(jsonb_array_length((select rows from claimed)), 3, 'con el secreto correcto se reclaman los avisos pendientes');
select is((select count(*)::int from private.notification_outbox where status = 'sending' and attempts = 1), 3, 'quedan «enviando» con un intento');
select is(jsonb_array_length(public.claim_notifications('secreto-de-prueba', 10)), 0, 'un aviso reclamado no se entrega dos veces');

-- Resultado del proveedor.
select tests.as_postgres();
create temp table ids as select id, kind from private.notification_outbox order by kind;
select tests.as_anon();
select is((public.complete_notification('secreto-de-prueba', (select id from ids where kind = 'reservation_confirmed'), true, 'msg-123') ->> 'status'), 'sent',
  '«enviado» solo cuando el proveedor lo confirma');
select is((public.complete_notification('secreto-de-prueba', (select id from ids where kind = 'reservation_received'), false, null, 'timeout', true) ->> 'status'), 'pending',
  'un fallo transitorio vuelve a la cola');
select is((public.complete_notification('secreto-de-prueba', (select id from ids where kind = 'reservation_cancelled'), false, null, 'dirección inválida', false) ->> 'status'), 'failed',
  'un fallo definitivo queda registrado como fallido');
select tests.as_postgres();
select ok((select next_attempt_at > now() from private.notification_outbox where id = (select id from ids where kind = 'reservation_received')), 'el reintento espera (retroceso)');
select is((select status::text from public.reservations where id = (select id::uuid from r1)), 'cancelled', 'el estado de la reserva no depende del resultado del envío');

select * from finish();
rollback;
