-- Fase 4 · punto 4: imágenes reales en Supabase Storage (logo, portada, fotos de platos).
--
-- Decisiones:
-- - Bucket PRIVADO. La carta pública no usa URLs permanentes: la app firma URLs de lectura (createSignedUrls)
--   con el cliente anónimo, y RLS decide qué objetos puede firmar el visitante.
-- - Ruta: <tenant_id>/<logo|cover|dish>/<uuid>.<webp|jpg>. Un UUID nuevo por subida: los nombres no colisionan.
-- - Escritura y borrado: solo can_operate (miembro con acceso operativo). Lectura: miembros, y público solo
--   para imágenes referenciadas por un comercio visible o por un plato disponible en una carta visible.
-- - Las columnas guardan la ruta (no una URL ni un data URL). Las URLs https de demos siguen aceptadas.

-- ───────────────────────── bucket ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-images', 'tenant-images', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ───────────────────────── rutas ─────────────────────────
-- Devuelve el tenant_id de una ruta válida, o null. Una ruta inválida nunca concede acceso.
create or replace function private.image_tenant_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|dish)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
      then split_part(p_name, '/', 1)::uuid
  end;
$$;

-- ¿La imagen está destinada a la carta pública? Solo logo/portada de comercios visibles y platos disponibles
-- en una carta visible. Cualquier otro objeto (borradores, platos ocultos, huérfanos) queda privado.
create or replace function private.image_is_public(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenants t
    where private.is_publicly_visible(t.id) and (t.logo_url = p_name or t.cover_url = p_name)
  )
  or exists (
    select 1
    from public.menu_items m
    join public.categories c on c.id = m.category_id and c.tenant_id = m.tenant_id
    where m.image_url = p_name
      and m.is_available
      and c.is_visible
      and private.is_publicly_visible(m.tenant_id)
  );
$$;

revoke all on function private.image_tenant_id(text) from public;
revoke all on function private.image_is_public(text) from public;
grant execute on function private.image_tenant_id(text) to anon, authenticated;
grant execute on function private.image_is_public(text) to anon, authenticated;

-- ───────────────────────── políticas de storage.objects ─────────────────────────
create policy tenant_images_select_anon on storage.objects
  for select to anon
  using (bucket_id = 'tenant-images' and private.image_is_public(name));

create policy tenant_images_select_authenticated on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tenant-images'
    and (private.is_tenant_member(private.image_tenant_id(name)) or private.image_is_public(name))
  );

create policy tenant_images_insert_operator on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tenant-images' and private.can_operate(private.image_tenant_id(name)));

create policy tenant_images_delete_operator on storage.objects
  for delete to authenticated
  using (bucket_id = 'tenant-images' and private.can_operate(private.image_tenant_id(name)));

-- ───────────────────────── columnas: rutas, nunca data URLs ─────────────────────────
alter table public.tenants drop constraint if exists tenants_logo_url;
alter table public.tenants drop constraint if exists tenants_cover_url;
alter table public.menu_items drop constraint if exists menu_items_image_url;

-- El prefijo de la ruta debe ser el id de la PROPIA fila. Sin esto, un dueño podría guardar en su logo la ruta de
-- una imagen de otro comercio y la política de lectura pública (image_is_public) permitiría firmarla.
alter table public.tenants add constraint tenants_logo_url check (
  logo_url is null
  or (logo_url ~ '^https://' and char_length(logo_url) <= 2048)
  or (logo_url ~ '^[0-9a-f-]{36}/logo/[0-9a-f-]{36}\.(webp|jpg)$' and split_part(logo_url, '/', 1) = id::text)
);
alter table public.tenants add constraint tenants_cover_url check (
  cover_url is null
  or (cover_url ~ '^https://' and char_length(cover_url) <= 2048)
  or (cover_url ~ '^[0-9a-f-]{36}/cover/[0-9a-f-]{36}\.(webp|jpg)$' and split_part(cover_url, '/', 1) = id::text)
);
alter table public.menu_items add constraint menu_items_image_url check (
  image_url is null
  or (image_url ~ '^https://' and char_length(image_url) <= 2048)
  or (image_url ~ '^[0-9a-f-]{36}/dish/[0-9a-f-]{36}\.(webp|jpg)$' and split_part(image_url, '/', 1) = tenant_id::text)
);

-- ───────────────────────── huérfanos ─────────────────────────
-- Objetos del comercio que ya no referencia ninguna fila. Se excluyen las subidas de la última hora
-- (pueden estar en curso o esperando el guardado). SECURITY INVOKER: RLS limita lo que se ve.
create or replace function public.tenant_image_orphans(p_tenant_id uuid)
returns table (name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'tenant-images'
    and private.image_tenant_id(o.name) = p_tenant_id
    and o.created_at < now() - interval '1 hour'
    and not exists (
      select 1 from public.tenants t
      where t.id = p_tenant_id and (t.logo_url = o.name or t.cover_url = o.name)
    )
    and not exists (
      select 1 from public.menu_items m
      where m.tenant_id = p_tenant_id and m.image_url = o.name
    );
$$;

revoke all on function public.tenant_image_orphans(uuid) from public;
grant execute on function public.tenant_image_orphans(uuid) to authenticated;
