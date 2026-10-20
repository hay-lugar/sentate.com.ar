-- Sentate · Fase 2 · 04: reservas (solicitudes sujetas a confirmación manual).
--
-- Transiciones de estado permitidas:
--   pending   → confirmed | rejected | cancelled
--   confirmed → cancelled
--   rejected, cancelled → (terminales)

create type public.reservation_status as enum ('pending', 'confirmed', 'rejected', 'cancelled');

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT: un comercio con reservas no se borra por accidente.
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  -- Instante absoluto del inicio (timestamptz) + fecha de servicio en la zona del comercio.
  -- 01:00 del sábado de un turno que abrió el viernes → service_date = viernes.
  starts_at timestamptz not null,
  service_date date not null,
  guests smallint not null,
  customer_name text not null,
  customer_phone text not null,
  notes text not null default '',
  status public.reservation_status not null default 'pending',
  -- Idempotencia de la solicitud pública: misma clave + mismo comercio = misma reserva.
  idempotency_key uuid,
  request_fingerprint text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_guests check (guests between 1 and 50),
  constraint reservations_name_len check (char_length(btrim(customer_name)) between 2 and 80),
  constraint reservations_phone_format check (
    customer_phone ~ '^[0-9 ()+-]+$'
    and char_length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) between 8 and 15
  ),
  constraint reservations_notes_len check (char_length(notes) <= 280),
  constraint reservations_idempotency_unique unique (tenant_id, idempotency_key),
  constraint reservations_fingerprint_with_key check ((idempotency_key is null) = (request_fingerprint is null))
);
comment on table public.reservations is
  'Solicitudes de mesa. Datos personales del comensal: nunca legibles por anon ni por otros comercios.';

-- Consultas del panel: agenda del día / próximas por fecha de servicio, y bandeja por estado.
create index reservations_tenant_service_idx on public.reservations (tenant_id, service_date, starts_at);
create index reservations_tenant_status_created_idx on public.reservations (tenant_id, status, created_at desc);

create trigger reservations_set_updated_at before update on public.reservations
  for each row execute function private.set_updated_at();

create or replace function private.reservations_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Campos inmutables una vez creada la solicitud (defensa además de los grants por columna).
  if new.tenant_id <> old.tenant_id or new.starts_at <> old.starts_at or new.service_date <> old.service_date
     or new.idempotency_key is distinct from old.idempotency_key
     or new.request_fingerprint is distinct from old.request_fingerprint
     or new.created_at <> old.created_at then
    raise exception using errcode = '42501', message = 'reservation_immutable_field';
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'rejected', 'cancelled'))
      or (old.status = 'confirmed' and new.status = 'cancelled')
    ) then
      raise exception using errcode = '23514', message = 'invalid_status_transition',
        detail = format('%s -> %s', old.status, new.status);
    end if;
    new.decided_at := pg_catalog.now();
  end if;
  return new;
end;
$$;
create trigger reservations_guard_update before update on public.reservations
  for each row execute function private.reservations_guard_update();
