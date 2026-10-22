-- {Sin Nombre} · Mejoras fase 5-7: registro idempotente de eventos de pago (base para Mercado Pago).
--
-- Alcance HONESTO: esta migración solo RECIBE y guarda eventos. No activa ni cambia ninguna suscripción: eso exige consultar
-- la API del proveedor con credenciales de sandbox y verificar el mapeo de estados, y todavía no se hizo (ver docs/pagos.md).
--  * Idempotente: un mismo evento (proveedor + clave) se guarda una sola vez, por más reintentos que haga el proveedor.
--  * Sin claves privilegiadas: quien registra se autentica con un secreto cuyo hash está en private.settings.
--  * El payload no se interpreta aquí y tiene tope de tamaño.

alter table private.settings add column payment_worker_secret_sha256 text;

create table private.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('mercadopago')),
  event_key text not null check (char_length(event_key) between 1 and 200),
  kind text not null check (char_length(kind) between 1 and 80),
  resource_id text check (resource_id is null or char_length(resource_id) <= 120),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint payment_events_unique unique (provider, event_key)
);
create index payment_events_status_idx on private.payment_events (received_at) where status = 'received';
alter table private.payment_events enable row level security;
revoke all on table private.payment_events from anon, authenticated;

create or replace function private.payment_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from private.settings s
                 where s.payment_worker_secret_sha256 is not null
                   and s.payment_worker_secret_sha256 = pg_catalog.encode(extensions.digest(p_secret, 'sha256'), 'hex'));
$$;
revoke all on function private.payment_secret_ok(text) from public;

create or replace function private.record_payment_event_impl(p_secret text, p_provider text, p_event_key text, p_kind text, p_resource_id text, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not private.payment_secret_ok(p_secret) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_provider is distinct from 'mercadopago' or coalesce(p_event_key, '') = '' or coalesce(p_kind, '') = '' then
    raise exception using errcode = 'P0001', message = 'invalid_event';
  end if;
  if pg_catalog.pg_column_size(coalesce(p_payload, '{}'::jsonb)) > 16384 then
    raise exception using errcode = 'P0001', message = 'payload_too_large';
  end if;
  insert into private.payment_events (provider, event_key, kind, resource_id, payload)
  values (p_provider, pg_catalog.left(p_event_key, 200), pg_catalog.left(p_kind, 80), pg_catalog.left(p_resource_id, 120), coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_key) do nothing;
  get diagnostics v_rows = row_count;
  return pg_catalog.jsonb_build_object('status', case when v_rows = 1 then 'recorded' else 'duplicate' end);
end;
$$;

create or replace function public.record_payment_event(p_secret text, p_provider text, p_event_key text, p_kind text, p_resource_id text default null, p_payload jsonb default '{}'::jsonb)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.record_payment_event_impl(p_secret, p_provider, p_event_key, p_kind, p_resource_id, p_payload); $$;

revoke all on function private.record_payment_event_impl(text, text, text, text, text, jsonb) from public;
revoke all on function public.record_payment_event(text, text, text, text, text, jsonb) from public;
grant execute on function private.record_payment_event_impl(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.record_payment_event(text, text, text, text, text, jsonb) to anon, authenticated;
