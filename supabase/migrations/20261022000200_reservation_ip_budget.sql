-- Fase 4 · punto 6: límite de solicitudes por conexión (IP) compartido, para el formulario público de reservas.
--
-- Qué resuelve: los topes por teléfono y por comercio (migración 07) no frenan a quien manda solicitudes con teléfonos
-- distintos desde una misma conexión. Esto agrega un cupo por conexión, guardado en la base: lo ven TODAS las
-- instancias del servidor (un contador en memoria no sirve en serverless).
--
-- Qué NO resuelve (ver docs/reservas-piloto.md):
-- - Quien llama a la RPC directamente con la clave publicable puede inventar la clave de conexión. La clave es un
--   HMAC con un secreto que solo conoce el servidor de la app, así que no se puede apuntar al cupo de otra IP, pero
--   tampoco se puede obligar a un llamador directo a usarla. El tope por comercio y por teléfono sigue valiendo para él.
-- - Una IP compartida (red móvil con CGNAT, wifi de un local) comparte el cupo.
--
-- La IP nunca llega a la base: el servidor manda un HMAC-SHA256 en hexadecimal (64 caracteres).

create table if not exists private.rate_limit_hits (
  scope text not null,
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (scope, key, window_start)
);
create index if not exists rate_limit_hits_window_idx on private.rate_limit_hits (window_start);

-- Sin políticas: solo lo tocan las funciones SECURITY DEFINER de abajo.
alter table private.rate_limit_hits enable row level security;

-- Consume una solicitud del cupo de la conexión. Límites FIJOS acá (no los elige quien llama):
--   12 solicitudes por 10 minutos y 60 por día, por conexión (todos los comercios juntos).
-- Cuenta intentos que llegan hasta esta función; una conexión bloqueada sigue sumando en su ventana.
create or replace function private.consume_reservation_ip_budget_impl(p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_short_seconds constant integer := 600;
  c_short_limit constant integer := 12;
  c_long_seconds constant integer := 86400;
  c_long_limit constant integer := 60;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_short_start timestamptz;
  v_long_start timestamptz;
  v_short_hits integer;
  v_long_hits integer;
begin
  -- La clave tiene que ser un HMAC-SHA256 en hex: nada que pueda contener una IP ni texto libre.
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  v_short_start := pg_catalog.to_timestamp(pg_catalog.floor(extract(epoch from v_now) / c_short_seconds) * c_short_seconds);
  v_long_start := pg_catalog.to_timestamp(pg_catalog.floor(extract(epoch from v_now) / c_long_seconds) * c_long_seconds);

  insert into private.rate_limit_hits as h (scope, key, window_start, hits)
  values ('reservation_10m', p_key, v_short_start, 1)
  on conflict (scope, key, window_start) do update set hits = h.hits + 1
  returning h.hits into v_short_hits;

  insert into private.rate_limit_hits as h (scope, key, window_start, hits)
  values ('reservation_1d', p_key, v_long_start, 1)
  on conflict (scope, key, window_start) do update set hits = h.hits + 1
  returning h.hits into v_long_hits;

  -- Limpieza de ventanas vencidas, de a ratos: acota el crecimiento de la tabla sin un cron.
  if pg_catalog.random() < 0.02 then
    delete from private.rate_limit_hits where window_start < v_now - interval '2 days';
  end if;

  if v_short_hits > c_short_limit then
    return pg_catalog.jsonb_build_object('allowed', false, 'window', '10m',
      'retry_after_seconds', pg_catalog.ceil(extract(epoch from (v_short_start + pg_catalog.make_interval(secs => c_short_seconds) - v_now)))::integer);
  end if;
  if v_long_hits > c_long_limit then
    return pg_catalog.jsonb_build_object('allowed', false, 'window', '1d',
      'retry_after_seconds', pg_catalog.ceil(extract(epoch from (v_long_start + pg_catalog.make_interval(secs => c_long_seconds) - v_now)))::integer);
  end if;
  return pg_catalog.jsonb_build_object('allowed', true, 'remaining', c_short_limit - v_short_hits);
end;
$$;

-- Envoltorio público SECURITY INVOKER (mismo patrón que request_reservation): la lógica privilegiada vive en private.
create or replace function public.consume_reservation_ip_budget(p_key text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.consume_reservation_ip_budget_impl(p_key);
$$;
comment on function public.consume_reservation_ip_budget(text) is
  'Cupo por conexión para solicitudes de mesa (12/10 min y 60/día). La clave es un HMAC-SHA256 hex del servidor, nunca la IP.';

revoke all on function private.consume_reservation_ip_budget_impl(text) from public;
revoke all on function public.consume_reservation_ip_budget(text) from public;
grant execute on function private.consume_reservation_ip_budget_impl(text) to anon, authenticated;
grant execute on function public.consume_reservation_ip_budget(text) to anon, authenticated;
