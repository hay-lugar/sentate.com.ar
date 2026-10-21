-- {Sin Nombre} · Explorador · Etapa G: superadministración (bandeja de moderación, suscripciones, destacados).
--
-- Toda operación valida en la BASE que quien llama es superadministrador (private.is_platform_admin: tabla separada de
-- tenant_members, sin autoasignación, sin user_metadata). Las funciones expuestas son SECURITY INVOKER; la autorización y
-- los privilegios viven en funciones privadas. Cada acción sensible deja registro en private.admin_audit_log
-- (quién, cuándo, qué, motivo y estado anterior/posterior).

-- ───────────────────────── Destacados ─────────────────────────
-- Apagado por defecto (sin filas no hay destacados). No tiene precio ni cobro: lo activa un superadmin con ventana de
-- fechas. Se muestra con la etiqueta «Destacado», aparte del orden orgánico, y respeta todos los filtros y la visibilidad.
create table public.featured_tenants (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text not null default 'Destacado',
  reason text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint featured_window check (ends_at > starts_at and ends_at - starts_at <= interval '90 days'),
  constraint featured_label check (label = 'Destacado')
);
alter table public.featured_tenants enable row level security;
revoke all on table public.featured_tenants from anon, authenticated;
grant select (tenant_id, starts_at, ends_at, label) on table public.featured_tenants to anon, authenticated;
grant select, insert, update, delete on table public.featured_tenants to service_role;
create policy featured_select on public.featured_tenants
  for select to anon, authenticated
  using (pg_catalog.now() >= starts_at and pg_catalog.now() < ends_at and private.is_listed(tenant_id));

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
                     from public.tenant_cuisines tc where tc.tenant_id = t.id), '{}') as cuisines,
           exists (select 1 from public.featured_tenants ft
                   where ft.tenant_id = t.id and pg_catalog.now() >= ft.starts_at and pg_catalog.now() < ft.ends_at) as featured
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
  shaped as (
    select f.*,
           pg_catalog.jsonb_build_object(
             'id', f.id, 'slug', f.slug, 'name', f.name, 'tagline', f.tagline,
             'business_type', f.business_type, 'cuisines', f.cuisines, 'price_range', f.price_range,
             'cover_url', f.cover_url, 'logo_url', f.logo_url,
             'lat', f.lat, 'lng', f.lng, 'locality', f.locality, 'neighborhood', f.neighborhood,
             'open_now', f.open_now, 'distance_m', case when f.dist is null then null else pg_catalog.round(f.dist::numeric) end,
             'featured', f.featured) as item
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


-- ───────────────────────── Superadministración ─────────────────────────
create or replace function private.require_platform_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return v_uid;
end;
$$;
revoke all on function private.require_platform_admin() from public;
grant execute on function private.require_platform_admin() to authenticated;

-- ¿Soy superadministrador? (solo para decidir qué mostrar; la autorización real está en cada operación)
create or replace function private.am_i_platform_admin_impl()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.is_platform_admin(); $$;

-- Bandeja de moderación / búsqueda de comercios.
create or replace function private.admin_moderation_queue_impl(p_status text, p_q text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(pg_catalog.btrim(pg_catalog.left(coalesce(p_q, ''), 60)), '');
begin
  perform private.require_platform_admin();
  if p_status not in ('all', 'draft', 'pending_review', 'approved', 'rejected', 'changes_requested')
     or p_limit not between 1 and 100 or p_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'invalid_filter';
  end if;
  return (
    with rows as (
      select t.id, t.slug, t.name, t.business_type, t.address, t.is_published, t.status as tenant_status,
             m.status as moderation, m.reason, m.suspension_reason, m.submitted_at,
             l.locality, (l.confirmed_at is not null) as location_confirmed,
             s.status as subscription, s.trial_ends_at, s.current_period_ends_at,
             (select u.email from public.tenant_members tm join auth.users u on u.id = tm.user_id
              where tm.tenant_id = t.id order by tm.created_at limit 1) as owner_email,
             exists (select 1 from public.featured_tenants f where f.tenant_id = t.id and pg_catalog.now() >= f.starts_at and pg_catalog.now() < f.ends_at) as featured
      from public.tenants t
      join public.tenant_moderation m on m.tenant_id = t.id
      left join public.tenant_locations l on l.tenant_id = t.id
      left join public.tenant_subscriptions s on s.tenant_id = t.id
      where (p_status = 'all' or m.status::text = p_status)
        and (v_q is null or t.name ilike '%' || pg_catalog.replace(pg_catalog.replace(v_q, '%', ''), '_', '') || '%'
             or t.slug ilike '%' || pg_catalog.replace(pg_catalog.replace(v_q, '%', ''), '_', '') || '%')
    ),
    page as (
      select * from rows
      order by (case when p_status = 'pending_review' then submitted_at end) asc nulls last, pg_catalog.lower(name), id
      limit p_limit offset p_offset
    )
    select pg_catalog.jsonb_build_object(
      'total', (select count(*) from rows),
      'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)) from page p), '[]'::jsonb))
  );
end;
$$;

-- Ficha completa de un comercio para revisar.
create or replace function private.admin_tenant_detail_impl(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return (
    select pg_catalog.jsonb_build_object(
      'tenant', pg_catalog.jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'tagline', t.tagline, 'cuisine', t.cuisine,
        'price_range', t.price_range, 'address', t.address, 'phone', t.phone, 'business_type', t.business_type,
        'website_url', t.website_url, 'instagram_url', t.instagram_url, 'facebook_url', t.facebook_url,
        'is_published', t.is_published, 'status', t.status, 'cover_url', t.cover_url, 'logo_url', t.logo_url, 'created_at', t.created_at),
      'moderation', (select pg_catalog.to_jsonb(m) from public.tenant_moderation m where m.tenant_id = t.id),
      'location', (select pg_catalog.jsonb_build_object('lat', l.lat, 'lng', l.lng, 'province_code', l.province_code, 'locality', l.locality,
                     'neighborhood', l.neighborhood, 'confirmed_at', l.confirmed_at) from public.tenant_locations l where l.tenant_id = t.id),
      'cuisines', coalesce((select pg_catalog.jsonb_agg(c.cuisine_code) from public.tenant_cuisines c where c.tenant_id = t.id), '[]'::jsonb),
      'subscription', (select pg_catalog.jsonb_build_object('status', s.status, 'trial_started_at', s.trial_started_at, 'trial_ends_at', s.trial_ends_at,
                         'current_period_ends_at', s.current_period_ends_at) from public.tenant_subscriptions s where s.tenant_id = t.id),
      'owners', coalesce((select pg_catalog.jsonb_agg(u.email) from public.tenant_members tm join auth.users u on u.id = tm.user_id where tm.tenant_id = t.id), '[]'::jsonb),
      'featured', (select pg_catalog.jsonb_build_object('starts_at', f.starts_at, 'ends_at', f.ends_at, 'reason', f.reason) from public.featured_tenants f where f.tenant_id = t.id),
      'missing', pg_catalog.to_jsonb(private.profile_missing(t.id)),
      'history', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', a.created_at, 'action', a.action, 'by', u.email, 'detail', a.detail) order by a.created_at desc)
        from (select * from private.admin_audit_log al where al.tenant_id = t.id order by al.created_at desc limit 50) a
        left join auth.users u on u.id = a.actor_id), '[]'::jsonb))
    from public.tenants t where t.id = p_tenant_id);
end;
$$;

-- Estado comercial administrado a mano (hasta integrar el cobro). El comercio NO puede editar nada de esto.
create or replace function private.admin_set_subscription_impl(p_tenant_id uuid, p_action text, p_days integer, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_before public.tenant_subscriptions%rowtype;
  v_after public.tenant_subscriptions%rowtype;
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  select * into v_before from public.tenant_subscriptions s where s.tenant_id = p_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'tenant_not_found';
  end if;
  if p_action = 'extend_trial' then
    if p_days is null or p_days not between 1 and 365 then raise exception using errcode = 'P0001', message = 'invalid_days'; end if;
    update public.tenant_subscriptions
    set status = 'trialing', trial_ends_at = greatest(trial_ends_at, pg_catalog.now()) + pg_catalog.make_interval(days => p_days)
    where tenant_id = p_tenant_id;
  elsif p_action = 'activate' then
    if p_days is null or p_days not between 1 and 366 then raise exception using errcode = 'P0001', message = 'invalid_days'; end if;
    update public.tenant_subscriptions
    set status = 'active',
        current_period_ends_at = greatest(coalesce(current_period_ends_at, pg_catalog.now()), pg_catalog.now()) + pg_catalog.make_interval(days => p_days)
    where tenant_id = p_tenant_id;
  elsif p_action = 'mark_past_due' then
    update public.tenant_subscriptions set status = 'past_due' where tenant_id = p_tenant_id;
  elsif p_action = 'cancel' then
    update public.tenant_subscriptions set status = 'canceled' where tenant_id = p_tenant_id;
  else
    raise exception using errcode = 'P0001', message = 'invalid_action';
  end if;
  select * into v_after from public.tenant_subscriptions s where s.tenant_id = p_tenant_id;
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values (v_uid, 'subscription_' || p_action, p_tenant_id, pg_catalog.jsonb_build_object(
    'reason', v_reason, 'days', p_days,
    'before', pg_catalog.jsonb_build_object('status', v_before.status, 'trial_ends_at', v_before.trial_ends_at, 'current_period_ends_at', v_before.current_period_ends_at),
    'after', pg_catalog.jsonb_build_object('status', v_after.status, 'trial_ends_at', v_after.trial_ends_at, 'current_period_ends_at', v_after.current_period_ends_at)));
  return pg_catalog.jsonb_build_object('status', v_after.status, 'trial_ends_at', v_after.trial_ends_at, 'current_period_ends_at', v_after.current_period_ends_at);
end;
$$;

create or replace function private.admin_set_featured_impl(p_tenant_id uuid, p_days integer, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if p_days is null or p_days not between 1 and 90 then
    raise exception using errcode = 'P0001', message = 'invalid_days';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception using errcode = 'P0001', message = 'tenant_not_found';
  end if;
  insert into public.featured_tenants (tenant_id, starts_at, ends_at, reason, created_by)
  values (p_tenant_id, pg_catalog.now(), pg_catalog.now() + pg_catalog.make_interval(days => p_days), v_reason, v_uid)
  on conflict (tenant_id) do update
  set starts_at = excluded.starts_at, ends_at = excluded.ends_at, reason = excluded.reason, created_by = excluded.created_by;
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values (v_uid, 'featured_set', p_tenant_id, pg_catalog.jsonb_build_object('days', p_days, 'reason', v_reason));
  return pg_catalog.jsonb_build_object('featured', true);
end;
$$;

create or replace function private.admin_clear_featured_impl(p_tenant_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
begin
  delete from public.featured_tenants where tenant_id = p_tenant_id;
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values (v_uid, 'featured_clear', p_tenant_id, pg_catalog.jsonb_build_object('reason', pg_catalog.btrim(coalesce(p_reason, ''))));
  return pg_catalog.jsonb_build_object('featured', false);
end;
$$;

-- Wrappers expuestos (SECURITY INVOKER).
create or replace function public.am_i_platform_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.am_i_platform_admin_impl(); $$;
create or replace function public.admin_moderation_queue(p_status text default 'pending_review', p_q text default null, p_limit integer default 30, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_moderation_queue_impl(p_status, p_q, p_limit, p_offset); $$;
create or replace function public.admin_tenant_detail(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_tenant_detail_impl(p_tenant_id); $$;
create or replace function public.admin_set_subscription(p_tenant_id uuid, p_action text, p_days integer default null, p_reason text default '')
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_set_subscription_impl(p_tenant_id, p_action, p_days, p_reason); $$;
create or replace function public.admin_set_featured(p_tenant_id uuid, p_days integer, p_reason text default '')
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_set_featured_impl(p_tenant_id, p_days, p_reason); $$;
create or replace function public.admin_clear_featured(p_tenant_id uuid, p_reason text default '')
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_clear_featured_impl(p_tenant_id, p_reason); $$;

revoke all on function private.am_i_platform_admin_impl() from public;
revoke all on function private.admin_moderation_queue_impl(text, text, integer, integer) from public;
revoke all on function private.admin_tenant_detail_impl(uuid) from public;
revoke all on function private.admin_set_subscription_impl(uuid, text, integer, text) from public;
revoke all on function private.admin_set_featured_impl(uuid, integer, text) from public;
revoke all on function private.admin_clear_featured_impl(uuid, text) from public;
revoke all on function public.am_i_platform_admin() from public;
revoke all on function public.admin_moderation_queue(text, text, integer, integer) from public;
revoke all on function public.admin_tenant_detail(uuid) from public;
revoke all on function public.admin_set_subscription(uuid, text, integer, text) from public;
revoke all on function public.admin_set_featured(uuid, integer, text) from public;
revoke all on function public.admin_clear_featured(uuid, text) from public;
grant execute on function private.am_i_platform_admin_impl() to authenticated;
grant execute on function private.admin_moderation_queue_impl(text, text, integer, integer) to authenticated;
grant execute on function private.admin_tenant_detail_impl(uuid) to authenticated;
grant execute on function private.admin_set_subscription_impl(uuid, text, integer, text) to authenticated;
grant execute on function private.admin_set_featured_impl(uuid, integer, text) to authenticated;
grant execute on function private.admin_clear_featured_impl(uuid, text) to authenticated;
grant execute on function public.am_i_platform_admin() to authenticated;
grant execute on function public.admin_moderation_queue(text, text, integer, integer) to authenticated;
grant execute on function public.admin_tenant_detail(uuid) to authenticated;
grant execute on function public.admin_set_subscription(uuid, text, integer, text) to authenticated;
grant execute on function public.admin_set_featured(uuid, integer, text) to authenticated;
grant execute on function public.admin_clear_featured(uuid, text) to authenticated;
