-- Imágenes del comercio en Storage (migración 20261022000100): aislamiento entre dos dueños,
-- lectura pública acotada a la carta visible, referencias cruzadas y huérfanos.
begin;
select plan(27);
select tests.seed_two_tenants();

-- Ruta válida para un comercio de prueba: <tenant_id>/<tipo>/<uuid derivado de n>.<ext>
create or replace function tests.img(p_slug text, p_kind text, p_n int, p_ext text default 'webp')
returns text
language sql
stable
set search_path = ''
as $$
  select tests.tenant_id(p_slug)::text || '/' || p_kind || '/' || lpad(p_n::text, 8, '0') || '-0000-4000-8000-000000000000.' || p_ext
$$;

-- ─────────── bucket ───────────
select is((select public from storage.buckets where id = 'tenant-images'), false, 'el bucket es privado');
select is((select file_size_limit::int from storage.buckets where id = 'tenant-images'), 2097152, 'límite de 2 MiB por archivo');
select is((select allowed_mime_types from storage.buckets where id = 'tenant-images'),
  array['image/webp', 'image/jpeg', 'image/png'], 'solo webp, jpeg y png: sin SVG ni otros formatos activos');

-- ─────────── rutas ───────────
select is(private.image_tenant_id(tests.img('bodegon-a', 'dish', 1)), tests.tenant_id('bodegon-a'),
  'una ruta válida devuelve su comercio');
select is(private.image_tenant_id('suelto.webp'), null, 'una ruta fuera del formato no pertenece a nadie');
select is(private.image_tenant_id(tests.img('bodegon-a', 'doc', 1, 'svg')), null, 'tipo de carpeta o extensión no permitidos → sin comercio');

-- ─────────── escritura del dueño ───────────
select tests.authenticate_as('owner_a@test.local');
select lives_ok(format($q$ insert into storage.objects (bucket_id, name) values ('tenant-images', %L) $q$,
  tests.img('bodegon-a', 'dish', 1)), 'A sube una imagen a su carpeta');
select throws_ok(format($q$ insert into storage.objects (bucket_id, name) values ('tenant-images', %L) $q$,
  tests.img('esquina-b', 'dish', 2)), '42501', null, 'A no puede subir a la carpeta de B');
select throws_ok($q$ insert into storage.objects (bucket_id, name) values ('tenant-images', 'suelto.webp') $q$,
  '42501', null, 'una ruta fuera del formato se rechaza aunque no nombre a otro comercio');
select is((select count(*)::int from storage.objects where bucket_id = 'tenant-images'), 1, 'A ve su propia imagen');

-- ─────────── lectura y borrado cruzados ───────────
select tests.as_postgres();
insert into storage.objects (bucket_id, name) values
  ('tenant-images', tests.img('esquina-b', 'dish', 2)),
  ('tenant-images', tests.img('esquina-b', 'logo', 3));

select tests.authenticate_as('owner_a@test.local');
select is((select count(*)::int from storage.objects where name like tests.tenant_id('esquina-b')::text || '/%'), 0,
  'A no ve las imágenes privadas de B');
-- Storage prohíbe DELETE directo por SQL (trigger storage.protect_delete): el borrado cruzado se prueba por la API en
-- tests/e2e-live/storage-imagenes.spec.ts. Acá se comprueba el predicado que usan las políticas de insert y delete.
select ok(not private.can_operate(private.image_tenant_id(tests.img('esquina-b', 'dish', 2))),
  'A no cumple la condición de escritura ni de borrado sobre la carpeta de B');
select ok(private.can_operate(private.image_tenant_id(tests.img('bodegon-a', 'dish', 1))),
  'A sí la cumple sobre su propia carpeta');
select is((select roles::text from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'tenant_images_delete_operator' and cmd = 'DELETE'),
  '{authenticated}', 'la política de borrado existe y es solo para usuarios autenticados');

-- ─────────── una columna no puede apuntar a imágenes ajenas ───────────
select throws_ok(format($q$ update public.tenants set logo_url = %L where id = tests.tenant_id('bodegon-a') $q$,
  tests.img('esquina-b', 'logo', 3)), '23514', null, 'A no puede apuntar su logo a una imagen de B');
select throws_ok(format($q$ update public.tenants set cover_url = %L where id = tests.tenant_id('bodegon-a') $q$,
  tests.img('bodegon-a', 'logo', 4)), '23514', null, 'la portada no acepta una ruta de logo');
select lives_ok(format($q$ update public.tenants set logo_url = %L where id = tests.tenant_id('bodegon-a') $q$,
  tests.img('bodegon-a', 'logo', 4)), 'A puede apuntar su logo a una ruta de su carpeta');
select lives_ok($q$ update public.tenants set cover_url = 'https://images.unsplash.com/photo-1' where id = tests.tenant_id('bodegon-a') $q$,
  'las URLs https de las demos siguen aceptadas');
select throws_ok($q$ update public.tenants set logo_url = 'data:image/png;base64,AAAA' where id = tests.tenant_id('bodegon-a') $q$,
  '23514', null, 'un data URL no se guarda en la base');

-- ─────────── lectura pública acotada a la carta visible ───────────
select tests.as_postgres();
insert into storage.objects (bucket_id, name) values ('tenant-images', tests.img('bodegon-a', 'logo', 4));
update public.tenants set logo_url = tests.img('esquina-b', 'logo', 3) where slug = 'esquina-b';

select tests.as_anon();
select is((select count(*)::int from storage.objects), 2,
  'el público ve solo los logos referenciados por comercios visibles (A y B)');
select is_empty($q$ select 1 from storage.objects where name like '%/dish/%' $q$,
  'el público no ve fotos de platos que ninguna carta referencia');

select tests.as_postgres();
with c as (insert into public.categories (tenant_id, name) values (tests.tenant_id('esquina-b'), 'Con foto') returning id)
insert into public.menu_items (tenant_id, category_id, name, price, image_url, is_available)
select tests.tenant_id('esquina-b'), c.id, 'Plato con foto', 1000, tests.img('esquina-b', 'dish', 2), true from c;
select tests.as_anon();
select is((select count(*)::int from storage.objects where name like '%/dish/%'), 1,
  'una foto de un plato disponible en una carta visible es pública');

select tests.as_postgres();
update public.menu_items set is_available = false where name = 'Plato con foto';
select tests.as_anon();
select is_empty($q$ select 1 from storage.objects where name like '%/dish/%' $q$, 'si el plato se oculta, su foto vuelve a ser privada');

select tests.as_postgres();
update public.tenants set is_published = false where slug = 'esquina-b';
select tests.as_anon();
select is((select count(*)::int from storage.objects where name like tests.tenant_id('esquina-b')::text || '/%'), 0,
  'un comercio despublicado deja de exponer sus imágenes');

-- ─────────── huérfanos ───────────
select tests.as_postgres();
insert into storage.objects (bucket_id, name, created_at) values
  ('tenant-images', tests.img('bodegon-a', 'dish', 5), now() - interval '2 hours'),
  ('tenant-images', tests.img('bodegon-a', 'dish', 6), now() - interval '2 hours'),
  ('tenant-images', tests.img('bodegon-a', 'dish', 7), now());
update public.menu_items set image_url = tests.img('bodegon-a', 'dish', 6) where name = 'Provoleta';

select tests.authenticate_as('owner_a@test.local');
select results_eq($q$ select name from public.tenant_image_orphans(tests.tenant_id('bodegon-a')) $q$,
  $q$ select tests.img('bodegon-a', 'dish', 5) $q$,
  'solo es huérfana la imagen vieja que ninguna fila referencia (no la referenciada ni la subida hace instantes)');

select tests.authenticate_as('owner_b@test.local');
select is_empty($q$ select 1 from public.tenant_image_orphans(tests.tenant_id('bodegon-a')) $q$,
  'B no ve los huérfanos de A');

select tests.authenticate_as('owner_a@test.local');
select throws_ok(format($q$ update public.menu_items set image_url = %L where name = 'Provoleta' $q$, tests.img('esquina-b', 'dish', 2)),
  '23514', null, 'un plato no puede apuntar a la foto de otro comercio');

select * from finish();
rollback;
