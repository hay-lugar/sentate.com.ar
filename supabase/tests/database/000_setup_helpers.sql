-- Helpers de prueba (solo entorno local; NO es una migración).
-- Se ejecuta primero (orden alfabético) y deja el esquema `tests` disponible para los demás archivos.
-- Patrón: los datos se preparan como postgres; las aserciones de permisos se ejecutan
-- cambiando a los roles reales de la Data API (anon / authenticated) con claims JWT.

create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create or replace function tests.create_user(p_email text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is not null then
    return v_id;
  end if;
  v_id := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email, '',
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
  return v_id;
end;
$$;

create or replace function tests.uid(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select id from auth.users where email = p_email $$;

-- Actúa como un usuario autenticado (rol + claims, como lo haría PostgREST con su JWT).
create or replace function tests.authenticate_as(p_email text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := tests.uid(p_email);
begin
  if v_id is null then
    raise exception 'usuario de prueba inexistente: %', p_email;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id, 'role', 'authenticated', 'email', p_email,
      -- user_metadata manipulable: las políticas NO deben usarlo.
      'user_metadata', json_build_object('tenant_id', 'cualquiera', 'role', 'owner'))::text, true);
end;
$$;

create or replace function tests.as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end;
$$;

create or replace function tests.as_postgres()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function tests.tenant_id(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select id from public.tenants where slug = p_slug $$;

-- Próxima fecha (en la zona del comercio) con el día de semana pedido, al menos `min_days` adelante.
create or replace function tests.next_service_date(p_weekday int, p_min_days int default 2,
  p_tz text default 'America/Argentina/Buenos_Aires')
returns date
language sql
stable
set search_path = ''
as $$
  select d::date
  from generate_series((now() at time zone p_tz)::date + p_min_days,
                       (now() at time zone p_tz)::date + p_min_days + 6, interval '1 day') d
  where extract(dow from d)::int = p_weekday
  limit 1
$$;

-- Escenario base: dos comercios publicados con dueños distintos, uno sin publicar, un usuario sin membresía.
create or replace function tests.seed_two_tenants()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_a uuid;
  v_b uuid;
  v_u uuid;
  v_cat_a uuid;
  v_cat_hidden uuid;
  v_cat_b uuid;
begin
  perform tests.create_user('owner_a@test.local');
  perform tests.create_user('owner_b@test.local');
  perform tests.create_user('outsider@test.local');

  -- Alta por la operación real, con la identidad de cada dueño.
  perform set_config('request.jwt.claims', json_build_object('sub', tests.uid('owner_a@test.local'))::text, true);
  v_a := (public.create_tenant('bodegon-a', 'Bodegón A') ->> 'tenant_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', tests.uid('owner_b@test.local'))::text, true);
  v_b := (public.create_tenant('esquina-b', 'Esquina B') ->> 'tenant_id')::uuid;
  v_u := (public.create_tenant('oculto-u', 'Oculto U') ->> 'tenant_id')::uuid;
  perform set_config('request.jwt.claims', '', true);

  update public.tenants set is_published = true, phone = '+54 11 4000-0000' where id in (v_a, v_b);

  for d in 0..6 loop
    insert into public.tenant_shifts (tenant_id, weekday, label, opens_at, closes_at) values
      (v_a, d, 'Almuerzo', '12:00', '16:00'),
      (v_a, d, 'Cena', '20:00', '02:00'),
      (v_b, d, 'Noche', '19:00', '23:30'),
      (v_u, d, 'Noche', '19:00', '23:30');
  end loop;

  insert into public.categories (tenant_id, name, position) values (v_a, 'Entradas', 0) returning id into v_cat_a;
  insert into public.categories (tenant_id, name, position, is_visible) values (v_a, 'Oculta', 1, false)
    returning id into v_cat_hidden;
  insert into public.categories (tenant_id, name, position) values (v_b, 'Burgers', 0) returning id into v_cat_b;
  insert into public.categories (tenant_id, name, position) values (v_u, 'Privada', 0);

  insert into public.menu_items (tenant_id, category_id, name, price, is_available) values
    (v_a, v_cat_a, 'Provoleta', 9800, true),
    (v_a, v_cat_a, 'Plato agotado', 5000, false),
    (v_a, v_cat_hidden, 'Plato en categoría oculta', 7000, true),
    (v_b, v_cat_b, 'Doble smash', 13900, true);

  insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, status)
  values
    (v_a, now() + interval '2 days', (now() + interval '2 days')::date, 4, 'Cliente A1', '+54 11 5555-0001', 'pending'),
    (v_a, now() + interval '3 days', (now() + interval '3 days')::date, 2, 'Cliente A2', '+54 11 5555-0003', 'confirmed'),
    (v_b, now() + interval '2 days', (now() + interval '2 days')::date, 3, 'Cliente B1', '+54 11 5555-0002', 'pending');
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Este archivo no tiene aserciones propias.
select plan(1);
select pass('helpers de prueba instalados');
select * from finish();
