-- {Sin Nombre} · Explorador · Etapa B: perfil geográfico, catálogos y requisitos de listado.
--
-- La ubicación de un comercio es SIEMPRE la dirección que el dueño confirma (con pin ajustable),
-- nunca la posición del dispositivo de quien edita. El explorador solo lista comercios con ubicación
-- confirmada (ver private.is_listed).

create extension if not exists postgis with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ───────────────────────── Catálogos normalizados (datos de referencia) ─────────────────────────
create table public.provinces (
  code text primary key,
  name text not null unique
);
create table public.business_types (
  code text primary key,
  label text not null unique,
  position smallint not null default 0
);
create table public.cuisines (
  code text primary key,
  label text not null unique,
  position smallint not null default 0
);
alter table public.provinces enable row level security;
alter table public.business_types enable row level security;
alter table public.cuisines enable row level security;
revoke all on table public.provinces, public.business_types, public.cuisines from anon, authenticated;
grant select on table public.provinces, public.business_types, public.cuisines to anon, authenticated;
grant select, insert, update, delete on table public.provinces, public.business_types, public.cuisines to service_role;
create policy provinces_select on public.provinces for select to anon, authenticated using (true);
create policy business_types_select on public.business_types for select to anon, authenticated using (true);
create policy cuisines_select on public.cuisines for select to anon, authenticated using (true);

insert into public.provinces (code, name) values
  ('caba', 'Ciudad Autónoma de Buenos Aires'), ('buenos-aires', 'Buenos Aires'), ('catamarca', 'Catamarca'),
  ('chaco', 'Chaco'), ('chubut', 'Chubut'), ('cordoba', 'Córdoba'), ('corrientes', 'Corrientes'),
  ('entre-rios', 'Entre Ríos'), ('formosa', 'Formosa'), ('jujuy', 'Jujuy'), ('la-pampa', 'La Pampa'),
  ('la-rioja', 'La Rioja'), ('mendoza', 'Mendoza'), ('misiones', 'Misiones'), ('neuquen', 'Neuquén'),
  ('rio-negro', 'Río Negro'), ('salta', 'Salta'), ('san-juan', 'San Juan'), ('san-luis', 'San Luis'),
  ('santa-cruz', 'Santa Cruz'), ('santa-fe', 'Santa Fe'), ('santiago-del-estero', 'Santiago del Estero'),
  ('tierra-del-fuego', 'Tierra del Fuego'), ('tucuman', 'Tucumán');

insert into public.business_types (code, label, position) values
  ('restaurante', 'Restaurante', 1), ('parrilla', 'Parrilla', 2), ('pizzeria', 'Pizzería', 3),
  ('bar', 'Bar', 4), ('cerveceria', 'Cervecería', 5), ('cafeteria', 'Cafetería', 6),
  ('panaderia', 'Panadería y pastelería', 7), ('heladeria', 'Heladería', 8),
  ('comida-rapida', 'Comida rápida', 9), ('otro', 'Otro', 10);

insert into public.cuisines (code, label, position) values
  ('argentina', 'Argentina', 1), ('parrilla', 'Parrilla', 2), ('pizza', 'Pizza', 3), ('pastas', 'Pastas', 4),
  ('italiana', 'Italiana', 5), ('japonesa', 'Japonesa', 6), ('hamburguesas', 'Hamburguesas', 7),
  ('empanadas', 'Empanadas', 8), ('minutas', 'Minutas', 9), ('mexicana', 'Mexicana', 10),
  ('peruana', 'Peruana', 11), ('mariscos', 'Pescados y mariscos', 12), ('vegetariana', 'Vegetariana', 13),
  ('vegana', 'Vegana', 14), ('cafe', 'Café y pastelería', 15), ('internacional', 'Internacional', 16);

-- ───────────────────────── Perfil público ampliado ─────────────────────────
alter table public.tenants
  add column business_type text references public.business_types (code),
  add column website_url text,
  add column instagram_url text,
  add column facebook_url text,
  add constraint tenants_website_url check (website_url is null or (website_url ~ '^https://[^[:space:]]+$' and char_length(website_url) <= 200)),
  add constraint tenants_instagram_url check (instagram_url is null or (instagram_url ~ '^https://(www\.)?instagram\.com/[^[:space:]]+$' and char_length(instagram_url) <= 200)),
  add constraint tenants_facebook_url check (facebook_url is null or (facebook_url ~ '^https://(www\.)?facebook\.com/[^[:space:]]+$' and char_length(facebook_url) <= 200));

create table public.tenant_cuisines (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cuisine_code text not null references public.cuisines (code),
  primary key (tenant_id, cuisine_code)
);
create index tenant_cuisines_code_idx on public.tenant_cuisines (cuisine_code, tenant_id);
alter table public.tenant_cuisines enable row level security;
revoke all on table public.tenant_cuisines from anon, authenticated;
grant select on table public.tenant_cuisines to anon, authenticated;
grant select, insert, update, delete on table public.tenant_cuisines to service_role;
create policy tenant_cuisines_select_anon on public.tenant_cuisines
  for select to anon using (private.is_listed(tenant_id));
create policy tenant_cuisines_select_authenticated on public.tenant_cuisines
  for select to authenticated using (private.is_listed(tenant_id) or private.is_tenant_member(tenant_id));

-- ───────────────────────── Ubicación confirmada ─────────────────────────
create function private.normalize_text(p_text text)
returns text
language sql
stable
set search_path = ''
as $$ select pg_catalog.lower(extensions.unaccent('extensions.unaccent'::regdictionary, pg_catalog.btrim(coalesce(p_text, '')))); $$;

create table public.tenant_locations (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  geog extensions.geography(Point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  province_code text not null references public.provinces (code),
  locality text not null,
  locality_key text not null,
  neighborhood text not null default '',
  -- Null = el dueño todavía no confirmó el pin: no se lista.
  confirmed_at timestamptz,
  confirmed_by uuid,
  updated_at timestamptz not null default now(),
  -- Cota de seguridad: territorio argentino (incluye Antártida no, a propósito).
  constraint tenant_locations_lat check (lat between -56 and -21),
  constraint tenant_locations_lng check (lng between -74 and -53),
  constraint tenant_locations_locality_len check (char_length(locality) between 2 and 80),
  constraint tenant_locations_neighborhood_len check (char_length(neighborhood) <= 80)
);
create index tenant_locations_geog_idx on public.tenant_locations using gist (geog);
create index tenant_locations_locality_idx on public.tenant_locations (province_code, locality_key);
create trigger tenant_locations_set_updated_at before update on public.tenant_locations
  for each row execute function private.set_updated_at();
alter table public.tenant_locations enable row level security;
revoke all on table public.tenant_locations from anon, authenticated;
-- Contrato público: sin confirmed_by. Escrituras solo por save_explorer_profile.
grant select (tenant_id, lat, lng, province_code, locality, locality_key, neighborhood, confirmed_at, updated_at)
  on table public.tenant_locations to anon, authenticated;
grant select, insert, update, delete on table public.tenant_locations to service_role;
create policy tenant_locations_select_anon on public.tenant_locations
  for select to anon using (private.is_listed(tenant_id));
create policy tenant_locations_select_authenticated on public.tenant_locations
  for select to authenticated using (private.is_listed(tenant_id) or private.is_tenant_member(tenant_id));

-- Mover el pin más de 200 m devuelve a revisión (sin ocultar la carta ni tocar reservas).
create or replace function private.tenant_locations_material_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if extensions.st_distance(old.geog, new.geog) > 200 then
    update public.tenant_moderation m
    set status = 'pending_review', submitted_at = pg_catalog.now(),
        reason = 'Cambió la ubicación: se revisa de nuevo.'
    where m.tenant_id = new.tenant_id and m.status = 'approved';
  end if;
  return new;
end;
$$;
revoke all on function private.tenant_locations_material_change() from public;
create trigger tenant_locations_material_change after update of lat, lng on public.tenant_locations
  for each row execute function private.tenant_locations_material_change();

-- ───────────────────────── Requisitos de perfil ─────────────────────────
create or replace function private.profile_missing(p_tenant_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.array_remove(array[
    case when t.business_type is null then 'business_type' end,
    case when pg_catalog.btrim(t.address) = '' then 'address' end,
    case when pg_catalog.btrim(t.phone) = '' then 'phone' end,
    case when not exists (select 1 from public.tenant_shifts s where s.tenant_id = t.id) then 'schedule' end,
    case when l.confirmed_at is null then 'location' end
  ]::text[], null)
  from public.tenants t
  left join public.tenant_locations l on l.tenant_id = t.id
  where t.id = p_tenant_id;
$$;
revoke all on function private.profile_missing(uuid) from public;

-- Regla única de listado: ahora exige también tipo de comercio y ubicación confirmada.
create or replace function private.is_listed(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_publicly_visible(p_tenant_id)
    and private.tenant_has_operational_access(p_tenant_id)
    and exists (select 1 from public.tenant_moderation m where m.tenant_id = p_tenant_id and m.status = 'approved')
    and exists (select 1 from public.tenants t where t.id = p_tenant_id and t.business_type is not null)
    and exists (select 1 from public.tenant_locations l where l.tenant_id = p_tenant_id and l.confirmed_at is not null);
$$;

-- El envío a revisión exige el perfil completo.
create or replace function private.submit_for_review_impl(p_tenant_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status public.moderation_status;
  v_missing text[];
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if not private.can_operate(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select m.status into v_status from public.tenant_moderation m where m.tenant_id = p_tenant_id for update;
  if v_status is null or v_status not in ('draft', 'changes_requested', 'rejected') then
    raise exception using errcode = 'P0001', message = 'invalid_moderation_transition';
  end if;
  v_missing := private.profile_missing(p_tenant_id);
  if pg_catalog.cardinality(v_missing) > 0 then
    raise exception using errcode = 'P0001', message = 'profile_incomplete', detail = pg_catalog.array_to_string(v_missing, ',');
  end if;
  update public.tenant_moderation
  set status = 'pending_review', submitted_at = pg_catalog.now(), reason = ''
  where tenant_id = p_tenant_id;
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values ((select auth.uid()), 'submit_for_review', p_tenant_id, pg_catalog.jsonb_build_object('from', v_status));
  return pg_catalog.jsonb_build_object('status', 'pending_review');
end;
$$;

-- ───────────────────────── Guardado del perfil del explorador ─────────────────────────
-- Atómico: tenants (tipo, enlaces, dirección) + cocinas + ubicación. Claves ausentes = sin cambios.
create or replace function private.save_explorer_profile_impl(p_tenant_id uuid, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cuisines text[];
  v_lat double precision;
  v_lng double precision;
  v_province text;
  v_locality text;
  v_neighborhood text;
  v_confirm boolean := coalesce((p ->> 'confirm')::boolean, false);
  v_existing public.tenant_locations;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if not private.can_operate(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if pg_catalog.jsonb_typeof(p) is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'invalid_payload';
  end if;

  if p ? 'business_type' then
    if p ->> 'business_type' is not null and not exists (select 1 from public.business_types b where b.code = p ->> 'business_type') then
      raise exception using errcode = 'P0001', message = 'invalid_business_type';
    end if;
  end if;

  update public.tenants t
  set business_type = case when p ? 'business_type' then p ->> 'business_type' else t.business_type end,
      website_url = case when p ? 'website_url' then nullif(pg_catalog.btrim(p ->> 'website_url'), '') else t.website_url end,
      instagram_url = case when p ? 'instagram_url' then nullif(pg_catalog.btrim(p ->> 'instagram_url'), '') else t.instagram_url end,
      facebook_url = case when p ? 'facebook_url' then nullif(pg_catalog.btrim(p ->> 'facebook_url'), '') else t.facebook_url end,
      address = case when p ? 'address' then pg_catalog.btrim(coalesce(p ->> 'address', '')) else t.address end
  where t.id = p_tenant_id;

  if p ? 'cuisines' then
    if pg_catalog.jsonb_typeof(p -> 'cuisines') is distinct from 'array' then
      raise exception using errcode = 'P0001', message = 'invalid_cuisines';
    end if;
    select coalesce(pg_catalog.array_agg(distinct v), '{}') into v_cuisines
    from pg_catalog.jsonb_array_elements_text(p -> 'cuisines') v;
    if pg_catalog.cardinality(v_cuisines) > 3
       or exists (select 1 from pg_catalog.unnest(v_cuisines) c where c not in (select code from public.cuisines)) then
      raise exception using errcode = 'P0001', message = 'invalid_cuisines';
    end if;
    delete from public.tenant_cuisines where tenant_id = p_tenant_id and cuisine_code <> all (v_cuisines);
    insert into public.tenant_cuisines (tenant_id, cuisine_code)
    select p_tenant_id, c from pg_catalog.unnest(v_cuisines) c
    on conflict do nothing;
  end if;

  if p ? 'lat' or p ? 'lng' or p ? 'province_code' or p ? 'locality' or p ? 'neighborhood' then
    select * into v_existing from public.tenant_locations where tenant_id = p_tenant_id;
    v_lat := coalesce((p ->> 'lat')::double precision, v_existing.lat);
    v_lng := coalesce((p ->> 'lng')::double precision, v_existing.lng);
    v_province := coalesce(p ->> 'province_code', v_existing.province_code);
    v_locality := pg_catalog.btrim(coalesce(p ->> 'locality', v_existing.locality, ''));
    v_neighborhood := pg_catalog.btrim(coalesce(p ->> 'neighborhood', v_existing.neighborhood, ''));
    if v_lat is null or v_lng is null or v_lat not between -56 and -21 or v_lng not between -74 and -53 then
      raise exception using errcode = 'P0001', message = 'invalid_coordinates';
    end if;
    if v_province is null or not exists (select 1 from public.provinces pr where pr.code = v_province) then
      raise exception using errcode = 'P0001', message = 'invalid_province';
    end if;
    if char_length(v_locality) not between 2 and 80 or char_length(v_neighborhood) > 80 then
      raise exception using errcode = 'P0001', message = 'invalid_locality';
    end if;
    insert into public.tenant_locations as l (tenant_id, lat, lng, province_code, locality, locality_key, neighborhood,
                                              confirmed_at, confirmed_by)
    values (p_tenant_id, v_lat, v_lng, v_province, v_locality, private.normalize_text(v_locality), v_neighborhood,
            case when v_confirm then pg_catalog.now() end, case when v_confirm then v_uid end)
    on conflict (tenant_id) do update
    set lat = excluded.lat, lng = excluded.lng, province_code = excluded.province_code,
        locality = excluded.locality, locality_key = excluded.locality_key, neighborhood = excluded.neighborhood,
        -- Mover el pin sin confirmar deja la ubicación sin confirmar.
        confirmed_at = case when v_confirm then pg_catalog.now()
                            when (l.lat, l.lng) is distinct from (excluded.lat, excluded.lng) then null
                            else l.confirmed_at end,
        confirmed_by = case when v_confirm then v_uid
                            when (l.lat, l.lng) is distinct from (excluded.lat, excluded.lng) then null
                            else l.confirmed_by end;
  end if;

  return pg_catalog.jsonb_build_object('missing', pg_catalog.to_jsonb(private.profile_missing(p_tenant_id)));
end;
$$;

create or replace function private.tenant_profile_missing_impl(p_tenant_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_tenant_member(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return private.profile_missing(p_tenant_id);
end;
$$;

create or replace function public.save_explorer_profile(p_tenant_id uuid, p_profile jsonb)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.save_explorer_profile_impl(p_tenant_id, p_profile); $$;
create or replace function public.tenant_profile_missing(p_tenant_id uuid)
returns text[] language sql stable security invoker set search_path = ''
as $$ select private.tenant_profile_missing_impl(p_tenant_id); $$;

revoke all on function private.save_explorer_profile_impl(uuid, jsonb) from public;
revoke all on function private.tenant_profile_missing_impl(uuid) from public;
revoke all on function private.normalize_text(text) from public;
revoke all on function public.save_explorer_profile(uuid, jsonb) from public;
revoke all on function public.tenant_profile_missing(uuid) from public;
grant execute on function private.save_explorer_profile_impl(uuid, jsonb) to authenticated;
grant execute on function private.tenant_profile_missing_impl(uuid) to authenticated;
grant execute on function public.save_explorer_profile(uuid, jsonb) to authenticated;
grant execute on function public.tenant_profile_missing(uuid) to authenticated;
