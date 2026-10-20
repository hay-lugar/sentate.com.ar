-- Sentate · Fase 2 · 01: esquemas, privilegios por defecto y utilidades.
--
-- Decisión: el acceso por Data API es opt-in. Ningún objeto nuevo en `public`
-- queda accesible para anon/authenticated salvo grant explícito en su migración.
-- El esquema `private` NO se expone en la API (ver supabase/config.toml).

create schema if not exists private;
comment on schema private is
  'Lógica interna (helpers de RLS, SECURITY DEFINER, configuración). No exponer en la Data API.';

-- Sin grants implícitos para objetos nuevos creados por `postgres` en public/private.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;

revoke all on schema private from public;
-- USAGE permite que las políticas RLS evalúen helpers de `private`; no da acceso a tablas
-- (no hay grants de tablas) y el esquema no está expuesto por PostgREST.
grant usage on schema private to anon, authenticated, service_role;

-- updated_at genérico (SECURITY INVOKER; solo toca NEW).
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- Validación de zona horaria IANA contra el catálogo de Postgres.
create or replace function private.is_valid_timezone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;
