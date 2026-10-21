-- {Sin Nombre} · Explorador · Etapa C: búsqueda, filtros, mapa y cercanía.
--
-- Todo el acceso público pasa por public.explore_search / public.explore_facets (SECURITY INVOKER: corren con RLS
-- del visitante) y filtran SIEMPRE con private.is_listed, la misma regla que usan las políticas de tenant_locations.
-- La posición del visitante llega como parámetro, se usa para calcular distancia y no se guarda ni se registra.

create extension if not exists pg_trgm with schema extensions;

-- Normalización inmutable (sin tildes, minúsculas) para poder indexarla.
create or replace function private.norm(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$ select pg_catalog.lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, ''))); $$;
revoke all on function private.norm(text) from public;
grant execute on function private.norm(text) to anon, authenticated;

create index tenants_name_trgm_idx on public.tenants using gin (private.norm(name) extensions.gin_trgm_ops);
create index menu_items_name_trgm_idx on public.menu_items using gin (private.norm(name) extensions.gin_trgm_ops);
create index tenant_locations_latlng_idx on public.tenant_locations (lat, lng);

-- ¿El local está abierto en el instante p_at? Zona horaria del comercio, turnos por día de servicio,
-- turnos que cruzan la medianoche y cierres excepcionales (la fecha de servicio cerrada prevalece).
create or replace function private.is_open_now(p_tenant_id uuid, p_tz text, p_at timestamptz)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with n as (select (p_at at time zone p_tz) as ts)
  select exists (
    select 1
    from public.tenant_shifts s, n
    where s.tenant_id = p_tenant_id
      and (
        (
          -- Turno que abre hoy (si cruza la medianoche, sigue abierto hasta el final del día).
          s.weekday = extract(dow from n.ts)::int
          and n.ts::time >= s.opens_at
          and (s.closes_at <= s.opens_at or n.ts::time < s.closes_at)
          and not exists (select 1 from public.tenant_closures c where c.tenant_id = s.tenant_id and c.service_date = n.ts::date)
        )
        or (
          -- Madrugada de un turno que abrió ayer y cruza la medianoche.
          s.closes_at <= s.opens_at
          and s.weekday = extract(dow from n.ts - interval '1 day')::int
          and n.ts::time < s.closes_at
          and not exists (select 1 from public.tenant_closures c where c.tenant_id = s.tenant_id and c.service_date = (n.ts::date - 1))
        )
      )
  );
$$;
revoke all on function private.is_open_now(uuid, text, timestamptz) from public;
grant execute on function private.is_open_now(uuid, text, timestamptz) to anon, authenticated;

create or replace function private.explore_text_array(p jsonb, p_key text, p_max integer)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_arr text[];
begin
  if not (p ? p_key) or pg_catalog.jsonb_typeof(p -> p_key) = 'null' then
    return null;
  end if;
  if pg_catalog.jsonb_typeof(p -> p_key) <> 'array' or pg_catalog.jsonb_array_length(p -> p_key) > p_max then
    raise exception using errcode = 'P0001', message = 'invalid_filter';
  end if;
  select pg_catalog.array_agg(pg_catalog.left(v, 60)) into v_arr from pg_catalog.jsonb_array_elements_text(p -> p_key) v;
  return nullif(v_arr, '{}');
end;
$$;
revoke all on function private.explore_text_array(jsonb, text, integer) from public;
grant execute on function private.explore_text_array(jsonb, text, integer) to anon, authenticated;

-- Búsqueda paginada. Filtros (todos opcionales, claves ausentes = sin filtro):
--   q, locality_key, province, business_types[], cuisines[], price[] ('$','$$','$$$'), open_now,
--   lat+lng (+ radius_km), bbox [oeste, sur, este, norte], sort (relevance|distance|name), limit (1..500), offset, at.
create or replace function public.explore_search(p jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_q text := pg_catalog.btrim(private.norm(left(coalesce(p ->> 'q', ''), 80)));
  v_locality text := nullif(pg_catalog.btrim(left(coalesce(p ->> 'locality_key', ''), 80)), '');
  v_province text := nullif(pg_catalog.btrim(left(coalesce(p ->> 'province', ''), 40)), '');
  v_bt text[] := private.explore_text_array(p, 'business_types', 10);
  v_cuis text[] := private.explore_text_array(p, 'cuisines', 10);
  v_price text[] := private.explore_text_array(p, 'price', 3);
  v_open boolean := coalesce((p ->> 'open_now')::boolean, false);
  v_at timestamptz := coalesce((p ->> 'at')::timestamptz, pg_catalog.now());
  v_sort text := coalesce(p ->> 'sort', 'relevance');
  v_limit integer := coalesce((p ->> 'limit')::integer, 20);
  v_offset integer := coalesce((p ->> 'offset')::integer, 0);
  v_lat double precision := (p ->> 'lat')::double precision;
  v_lng double precision := (p ->> 'lng')::double precision;
  v_radius double precision := (p ->> 'radius_km')::double precision;
  v_point extensions.geography;
  v_w double precision; v_s double precision; v_e double precision; v_n double precision;
  v_result jsonb;
begin
  if v_sort not in ('relevance', 'distance', 'name') or v_limit not between 1 and 500 or v_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'invalid_filter';
  end if;
  if (v_lat is null) <> (v_lng is null) or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception using errcode = 'P0001', message = 'invalid_filter';
  end if;
  if v_lat is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;
  end if;
  if v_radius is not null and (v_point is null or v_radius not between 0.1 and 500) then
    raise exception using errcode = 'P0001', message = 'invalid_filter';
  end if;
  if v_sort = 'distance' and v_point is null then
    v_sort := 'name';
  end if;
  if p ? 'bbox' and pg_catalog.jsonb_typeof(p -> 'bbox') <> 'null' then
    if pg_catalog.jsonb_typeof(p -> 'bbox') <> 'array' or pg_catalog.jsonb_array_length(p -> 'bbox') <> 4 then
      raise exception using errcode = 'P0001', message = 'invalid_filter';
    end if;
    v_w := (p -> 'bbox' ->> 0)::double precision;
    v_s := (p -> 'bbox' ->> 1)::double precision;
    v_e := (p -> 'bbox' ->> 2)::double precision;
    v_n := (p -> 'bbox' ->> 3)::double precision;
    if v_w >= v_e or v_s >= v_n or v_s < -90 or v_n > 90 or v_w < -180 or v_e > 180 then
      raise exception using errcode = 'P0001', message = 'invalid_filter';
    end if;
  end if;

  with base as (
    select t.id, t.slug, t.name, t.tagline, t.business_type, t.price_range, t.cover_url, t.logo_url, t.timezone,
           l.lat, l.lng, l.locality, l.locality_key, l.neighborhood, l.province_code,
           case when v_point is not null then extensions.st_distance(l.geog, v_point) end as dist,
           coalesce((select pg_catalog.array_agg(tc.cuisine_code order by tc.cuisine_code)
                     from public.tenant_cuisines tc where tc.tenant_id = t.id), '{}') as cuisines
    from public.tenants t
    join public.tenant_locations l on l.tenant_id = t.id
    where private.is_listed(t.id)
      and (v_locality is null or l.locality_key = v_locality)
      and (v_province is null or l.province_code = v_province)
      and (v_bt is null or t.business_type = any (v_bt))
      and (v_price is null or t.price_range = any (v_price))
      and (v_cuis is null or exists (select 1 from public.tenant_cuisines tc where tc.tenant_id = t.id and tc.cuisine_code = any (v_cuis)))
      and (v_w is null or (l.lng between v_w and v_e and l.lat between v_s and v_n))
      and (v_radius is null or extensions.st_dwithin(l.geog, v_point, v_radius * 1000))
  ),
  scored as (
    select b.*,
           case when v_q = '' then 0::real else greatest(
             extensions.word_similarity(v_q, private.norm(b.name)),
             0.9 * extensions.word_similarity(v_q, b.locality_key),
             0.7 * extensions.word_similarity(v_q, private.norm(b.neighborhood)),
             0.8 * extensions.word_similarity(v_q, private.norm((select bt.label from public.business_types bt where bt.code = b.business_type))),
             0.8 * coalesce((select max(extensions.word_similarity(v_q, private.norm(c.label)))
                             from public.cuisines c where c.code = any (b.cuisines)), 0),
             0.6 * coalesce((select max(extensions.word_similarity(v_q, private.norm(mi.name)))
                             from public.menu_items mi
                             join public.categories ca on ca.tenant_id = mi.tenant_id and ca.id = mi.category_id
                             where mi.tenant_id = b.id and mi.is_available and ca.is_visible), 0)
           ) end as score,
           private.is_open_now(b.id, b.timezone, v_at) as open_now
    from base b
  ),
  filtered as (
    select s.*, count(*) over () as total
    from scored s
    where (v_q = '' or s.score >= 0.4) and (not v_open or s.open_now)
  ),
  ranked as (
    select f.*,
           pg_catalog.row_number() over (
             order by (case when v_sort = 'distance' then f.dist end) asc nulls last,
                      (case when v_sort = 'relevance' then f.score end) desc nulls last,
                      (case when v_sort = 'relevance' then f.dist end) asc nulls last,
                      private.norm(f.name), f.id) as rn
    from filtered f
  ),
  page as (
    select r.* from ranked r where r.rn > v_offset and r.rn <= v_offset + v_limit
  )
  select pg_catalog.jsonb_build_object(
           'total', coalesce(max(pg.total), (select count(*) from filtered)),
           'items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'id', pg.id, 'slug', pg.slug, 'name', pg.name, 'tagline', pg.tagline,
             'business_type', pg.business_type, 'cuisines', pg.cuisines, 'price_range', pg.price_range,
             'cover_url', pg.cover_url, 'logo_url', pg.logo_url,
             'lat', pg.lat, 'lng', pg.lng, 'locality', pg.locality, 'neighborhood', pg.neighborhood,
             'open_now', pg.open_now, 'distance_m', case when pg.dist is null then null else pg_catalog.round(pg.dist::numeric) end
           ) order by pg.rn), '[]'::jsonb))
  into v_result
  from page pg;

  return v_result;
end;
$$;

-- Facetas del directorio (solo comercios listados): localidades, tipos, cocinas y precios con su cantidad.
create or replace function public.explore_facets()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with listed as (
    select t.id, t.business_type, t.price_range, l.locality, l.locality_key, l.province_code
    from public.tenants t
    join public.tenant_locations l on l.tenant_id = t.id
    where private.is_listed(t.id)
  )
  select pg_catalog.jsonb_build_object(
    'total', (select count(*) from listed),
    'localities', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', x.locality_key, 'label', x.label, 'province', x.province_code, 'count', x.n) order by x.n desc, x.label)
      from (select locality_key, province_code, pg_catalog.min(locality) as label, count(*) as n
            from listed group by locality_key, province_code) x), '[]'::jsonb),
    'business_types', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', bt.code, 'label', bt.label, 'count', x.n) order by bt.position)
      from public.business_types bt
      join (select business_type, count(*) as n from listed group by business_type) x on x.business_type = bt.code), '[]'::jsonb),
    'cuisines', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', c.code, 'label', c.label, 'count', x.n) order by c.position)
      from public.cuisines c
      join (select tc.cuisine_code, count(*) as n
            from public.tenant_cuisines tc join listed on listed.id = tc.tenant_id group by tc.cuisine_code) x
        on x.cuisine_code = c.code), '[]'::jsonb),
    'price', coalesce((select pg_catalog.jsonb_object_agg(price_range, n) from (select price_range, count(*) as n from listed group by price_range) y), '{}'::jsonb)
  );
$$;

revoke all on function public.explore_search(jsonb) from public;
revoke all on function public.explore_facets() from public;
grant execute on function public.explore_search(jsonb) to anon, authenticated;
grant execute on function public.explore_facets() to anon, authenticated;
