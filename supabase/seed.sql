-- FIXTURES DE DESARROLLO — datos 100 % ficticios. Solo para `supabase db reset` local.
-- Nunca ejecutar en un proyecto remoto. Las pruebas (supabase/tests) NO dependen de este archivo.
--
-- Usuarios (contraseña local para todos: sentate-dev-only):
--   owner.bodegon@example.test  → El Bodegón (publicado, prueba vigente)
--   owner.esquina@example.test  → La Esquina (publicado, prueba vigente, turno hasta las 03:00)
--   owner.sakura@example.test   → Sakura     (publicado, PRUEBA VENCIDA con estado 'trialing')
--   sin.local@example.test      → usuario sin comercio

do $$
declare
  v_users jsonb := '[
    {"email": "owner.bodegon@example.test"},
    {"email": "owner.esquina@example.test"},
    {"email": "owner.sakura@example.test"},
    {"email": "sin.local@example.test"}
  ]';
  u jsonb;
  v_id uuid;
begin
  for u in select * from jsonb_array_elements(v_users) loop
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u ->> 'email',
      extensions.crypt('sentate-dev-only', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', u ->> 'email', 'email_verified', true), 'email', now(), now(), now());
  end loop;
end;
$$;

-- Comercios con UUID fijos para facilitar pruebas manuales.
insert into public.tenants (id, slug, name, tagline, cuisine, price_range, address, phone, timezone,
  cover_url, primary_color, primary_fg_color, accent_color, accent_fg_color, is_published)
values
  ('11111111-1111-4111-8111-111111111111', 'prueba-bodegon', 'El Bodegón', 'Parrilla de barrio desde 1987', 'Parrilla argentina',
   '$$', 'Av. Corrientes 4120, Almagro', '+54 11 4862-1987', 'America/Argentina/Buenos_Aires',
   'https://images.unsplash.com/photo-1555939594-58d7cb561ad1', '#b8461b', '#ffffff', '#f7e6d4', '#6b2a10', true),
  ('22222222-2222-4222-8222-222222222222', 'prueba-esquina', 'La Esquina', 'Burgers, pizzas y tragos hasta tarde', 'Bar & cocina',
   '$$', 'Thames 1650, Palermo', '+54 11 4833-2040', 'America/Argentina/Buenos_Aires',
   'https://images.unsplash.com/photo-1514933651103-005eec06c04b', '#0f766e', '#ffffff', '#d9f2ec', '#0b4d47', true),
  ('33333333-3333-4333-8333-333333333333', 'prueba-sakura', 'Sakura', 'Nikkei & sushi de autor', 'Japonesa · Nikkei',
   '$$$', 'Gorriti 5870, Palermo Hollywood', '+54 11 4775-8800', 'America/Argentina/Buenos_Aires',
   'https://images.unsplash.com/photo-1579871494447-9811cf80d66c', '#be123c', '#ffffff', '#fde4ea', '#881337', true);

insert into public.tenant_members (tenant_id, user_id, role)
select t.id, u.id, 'owner'
from (values ('prueba-bodegon', 'owner.bodegon@example.test'),
             ('prueba-esquina', 'owner.esquina@example.test'),
             ('prueba-sakura', 'owner.sakura@example.test')) m(slug, email)
join public.tenants t on t.slug = m.slug
join auth.users u on u.email = m.email;

insert into public.tenant_subscriptions (tenant_id, status, trial_started_at, trial_ends_at)
select id, 'trialing',
  case when slug = 'prueba-sakura' then now() - interval '40 days' else now() - interval '3 days' end,
  case when slug = 'prueba-sakura' then now() - interval '10 days' else now() + interval '27 days' end
from public.tenants;

-- Horarios: El Bodegón (cerrado lunes; domingo solo almuerzo) almuerzo + cena hasta 00:30; La Esquina 18–03 todos los días; Sakura 19:30–00:00 (cerrado domingo).
insert into public.tenant_shifts (tenant_id, weekday, label, opens_at, closes_at)
select '11111111-1111-4111-8111-111111111111'::uuid, d, s.label, s.o, s.c
from generate_series(0, 6) d,
     (values ('Almuerzo', time '12:00', time '16:00'), ('Cena', time '20:00', time '00:30')) s(label, o, c)
where d <> 1 and not (d = 0 and s.label = 'Cena')
union all
select '22222222-2222-4222-8222-222222222222'::uuid, d, 'Noche', time '18:00', time '03:00' from generate_series(0, 6) d
union all
select '33333333-3333-4333-8333-333333333333'::uuid, d, 'Cena', time '19:30', time '00:00' from generate_series(1, 6) d;

-- Carta (subconjunto de los mocks del frontend).
with cats as (
  insert into public.categories (tenant_id, name, position, is_visible)
  values
    ('11111111-1111-4111-8111-111111111111', 'Entradas', 0, true),
    ('11111111-1111-4111-8111-111111111111', 'Parrilla', 1, true),
    ('11111111-1111-4111-8111-111111111111', 'Postres', 2, true),
    ('22222222-2222-4222-8222-222222222222', 'Burgers', 0, true),
    ('22222222-2222-4222-8222-222222222222', 'Tragos', 1, true),
    ('33333333-3333-4333-8333-333333333333', 'Rolls', 0, true),
    ('33333333-3333-4333-8333-333333333333', 'Postres', 1, false)
  returning id, tenant_id, name
)
insert into public.menu_items (tenant_id, category_id, name, description, price, image_url, tags, is_available, position)
select c.tenant_id, c.id, i.name, i.description, i.price, i.image_url, i.tags, i.available, i.pos
from cats c
join (values
  ('Entradas', 'Provoleta a la parrilla', 'Provolone hilado, orégano y ají molido.', 9800, null, array['veggie', 'popular'], true, 0),
  ('Entradas', 'Empanadas de carne', 'Cortada a cuchillo. Porción de 3.', 7200, null, array[]::text[], true, 1),
  ('Parrilla', 'Ojo de bife 400g', 'Madurado 21 días, con papas rústicas.', 26500,
     'https://images.unsplash.com/photo-1594041680534-e8c8cdebd659', array['popular', 'sin-tacc'], true, 0),
  ('Parrilla', 'Bondiola braseada', 'Con manzanas caramelizadas.', 19900, null, array[]::text[], false, 1),
  ('Postres', 'Flan casero mixto', 'Con dulce de leche y crema.', 6500, null, array['popular'], true, 0),
  ('Burgers', 'Doble smash', 'Dos medallones, cheddar y pickles.', 13900,
     'https://images.unsplash.com/photo-1607013251379-e6eecfffe234', array['popular'], true, 0),
  ('Tragos', 'Negroni de la casa', 'Gin, Campari y vermut rosso.', 7900, null, array[]::text[], true, 0),
  ('Rolls', 'Philadelphia roll', 'Salmón, queso crema y palta. 10 piezas.', 15800, null, array['popular'], true, 0)
) i(category, name, description, price, image_url, tags, available, pos) on i.category = c.name
where (c.name, c.tenant_id) <> ('Postres', '33333333-3333-4333-8333-333333333333'::uuid);

-- Reservas ficticias relativas a hoy (fecha de servicio en hora de Argentina).
insert into public.reservations (tenant_id, starts_at, service_date, guests, customer_name, customer_phone, notes, status)
select r.tenant_id,
  ((today + r.day_offset + r.calendar_shift) + r.t) at time zone 'America/Argentina/Buenos_Aires',
  today + r.day_offset, r.guests, r.name, r.phone, r.notes, r.status::public.reservation_status
from (select (now() at time zone 'America/Argentina/Buenos_Aires')::date as today) d,
     (values
       ('11111111-1111-4111-8111-111111111111'::uuid, 0, 0, time '21:30', 4, 'Cliente Ficticio Uno', '+54 11 5550-0001', 'Cumpleaños', 'pending'),
       ('11111111-1111-4111-8111-111111111111'::uuid, 0, 0, time '13:00', 7, 'Cliente Ficticio Dos', '+54 11 5550-0002', '', 'confirmed'),
       ('11111111-1111-4111-8111-111111111111'::uuid, 1, 0, time '21:00', 2, 'Cliente Ficticio Tres', '+54 11 5550-0003', 'Sin TACC', 'pending'),
       -- 01:00 del turno que abrió hoy → fecha calendario de mañana, fecha de servicio de hoy.
       ('22222222-2222-4222-8222-222222222222'::uuid, 0, 1, time '01:00', 3, 'Cliente Ficticio Cuatro', '+54 11 5550-0004', '', 'pending'),
       ('22222222-2222-4222-8222-222222222222'::uuid, 0, 0, time '22:30', 8, 'Cliente Ficticio Cinco', '+54 11 5550-0005', '', 'rejected')
     ) r(tenant_id, day_offset, calendar_shift, t, guests, name, phone, notes, status);
