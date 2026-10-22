-- {Sin Nombre} · Filtro «Con promoción» del explorador.
-- Solo comercios con una promoción vigente (public.tenant_promotions: ventana de fechas y visibilidad ya las resuelve RLS, pero
-- se vuelve a comprobar la ventana acá para no depender de ella). Sin el parámetro, la búsqueda no cambia.

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
  v_reserve boolean := (p ->> 'accepts_reservations')::boolean;
  v_promo boolean := coalesce((p ->> 'with_promotion')::boolean, false);
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
                     from public.tenant_cuisines tc where tc.tenant_id = t.id), '{}') as cuisines,
           exists (select 1 from public.featured_tenants ft
                   where ft.tenant_id = t.id and pg_catalog.now() >= ft.starts_at and pg_catalog.now() < ft.ends_at) as featured,
           coalesce(rs.accepts_reservations, true) as accepts_reservations
    from public.tenants t
    join public.tenant_locations l on l.tenant_id = t.id
    left join public.tenant_reservation_settings rs on rs.tenant_id = t.id
    where private.is_listed(t.id)
      and (v_reserve is null or coalesce(rs.accepts_reservations, true) = v_reserve)
      and (not v_promo or exists (select 1 from public.tenant_promotions tp where tp.tenant_id = t.id and pg_catalog.now() >= tp.starts_at and pg_catalog.now() < tp.ends_at))
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
  shaped as (
    select f.*,
           pg_catalog.jsonb_build_object(
             'id', f.id, 'slug', f.slug, 'name', f.name, 'tagline', f.tagline,
             'business_type', f.business_type, 'cuisines', f.cuisines, 'price_range', f.price_range,
             'cover_url', f.cover_url, 'logo_url', f.logo_url,
             'lat', f.lat, 'lng', f.lng, 'locality', f.locality, 'neighborhood', f.neighborhood,
             'open_now', f.open_now, 'distance_m', case when f.dist is null then null else pg_catalog.round(f.dist::numeric) end,
             'featured', f.featured, 'accepts_reservations', f.accepts_reservations) as item
    from filtered f
  ),
  ranked as (
    select s.*,
           pg_catalog.row_number() over (
             order by (case when v_sort = 'distance' then s.dist end) asc nulls last,
                      (case when v_sort = 'relevance' then s.score end) desc nulls last,
                      (case when v_sort = 'relevance' then s.dist end) asc nulls last,
                      private.norm(s.name), s.id) as rn
    from shaped s
  ),
  page as (
    select r.* from ranked r where r.rn > v_offset and r.rn <= v_offset + v_limit
  )
  select pg_catalog.jsonb_build_object(
           'total', coalesce(max(pg.total), (select count(*) from filtered)),
           'items', coalesce(pg_catalog.jsonb_agg(pg.item order by pg.rn), '[]'::jsonb),
           -- Destacados: bloque APARTE del orden orgánico. Cumplen todos los filtros y la visibilidad; solo en la primera
           -- página y nunca en el orden «Más cercanos».
           'featured_items', case when v_sort = 'distance' or v_offset > 0 then '[]'::jsonb else coalesce((
              select pg_catalog.jsonb_agg(fx.item order by fx.nm)
              from (select sh.item, private.norm(sh.name) as nm from shaped sh where sh.featured order by private.norm(sh.name) limit 3) fx
           ), '[]'::jsonb) end)
  into v_result
  from page pg;

  return v_result;
end;
$$;


