-- {Sin Nombre} · Plan de lanzamiento, PR4: aviso cuando una solicitud vence sin respuesta.
-- Quien pidió avisos (email + consentimiento) recibe un mensaje cuando el local no llegó a responder y la solicitud venció, en
-- vez de quedar esperando. Mismas reglas que el resto: la reserva nunca depende del envío y el aviso se encola una sola vez.

alter table private.notification_outbox drop constraint outbox_kind;
alter table private.notification_outbox add constraint outbox_kind check (
  kind in ('reservation_received', 'reservation_confirmed', 'reservation_rejected', 'reservation_cancelled', 'reservation_expired'));

create or replace function private.reservations_enqueue_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_tenant public.tenants%rowtype;
begin
  if new.customer_email is null or not new.notify_consent then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_kind := 'reservation_received';
  elsif new.status is distinct from old.status then
    v_kind := case new.status
      when 'confirmed' then 'reservation_confirmed'
      when 'rejected' then 'reservation_rejected'
      -- La solicitud venció sin respuesta del local (la marca el sistema): se le avisa para que no quede esperando.
      when 'expired' then 'reservation_expired'
      -- Solo cancelaciones HECHAS POR EL LOCAL: quien cancela su propia reserva no necesita un aviso de eso.
      when 'cancelled' then case when auth.uid() is distinct from new.user_id or new.user_id is null then 'reservation_cancelled' end
      else null end;
  end if;
  if v_kind is null then
    return new;
  end if;
  select * into v_tenant from public.tenants t where t.id = new.tenant_id;
  insert into private.notification_outbox (kind, recipient, reservation_id, tenant_id, payload)
  values (v_kind, new.customer_email, new.id, new.tenant_id, pg_catalog.jsonb_build_object(
    'tenant_name', v_tenant.name, 'tenant_phone', v_tenant.phone, 'tenant_slug', v_tenant.slug, 'timezone', v_tenant.timezone,
    'starts_at', new.starts_at, 'guests', new.guests, 'first_name', pg_catalog.split_part(pg_catalog.btrim(new.customer_name), ' ', 1)))
  on conflict (reservation_id, kind, channel) do nothing;
  return new;
end;
$$;
revoke all on function private.reservations_enqueue_notification() from public;
