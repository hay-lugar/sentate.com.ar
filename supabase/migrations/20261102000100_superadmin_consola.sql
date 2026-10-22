-- {Sin Nombre} · Consola de superadministración: resumen, suscripciones, usuarios, administradores, auditoría y sistema.
--
-- Mismas reglas que la etapa G: SECURITY DEFINER solo en private.*_impl (validan private.require_platform_admin), wrappers
-- públicos SECURITY INVOKER, nada para anon, y cada cambio deja registro en private.admin_audit_log.
-- Solo lectura salvo: alta/baja de administradores y el ajuste de visibilidad de la carta con acceso vencido.

-- ───────────────────────── Resumen ─────────────────────────
create or replace function private.admin_platform_overview_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return pg_catalog.jsonb_build_object(
    'tenants', pg_catalog.jsonb_build_object(
      'total', (select count(*) from public.tenants),
      'published', (select count(*) from public.tenants where is_published),
      'suspended', (select count(*) from public.tenants where status = 'suspended'),
      'listed', (select count(*) from public.tenants t where private.is_listed(t.id)),
      'featured_active', (select count(*) from public.featured_tenants f where pg_catalog.now() >= f.starts_at and pg_catalog.now() < f.ends_at)),
    'moderation', coalesce((select pg_catalog.jsonb_object_agg(s, n) from (select m.status::text as s, count(*) as n from public.tenant_moderation m group by 1) x), '{}'::jsonb),
    'subscriptions', coalesce((select pg_catalog.jsonb_object_agg(s, n) from (select st.status::text as s, count(*) as n from public.tenant_subscriptions st group by 1) x), '{}'::jsonb),
    'trials_ending_7d', (select count(*) from public.tenant_subscriptions st
                         where st.status = 'trialing' and st.trial_ends_at >= pg_catalog.now() and st.trial_ends_at < pg_catalog.now() + interval '7 days'),
    'users', pg_catalog.jsonb_build_object(
      'total', (select count(*) from auth.users),
      'last_7d', (select count(*) from auth.users u where u.created_at >= pg_catalog.now() - interval '7 days'),
      'admins', (select count(*) from private.platform_admins)),
    'reservations', pg_catalog.jsonb_build_object(
      'total', (select count(*) from public.reservations),
      'last_30d', (select count(*) from public.reservations r where r.created_at >= pg_catalog.now() - interval '30 days'),
      'by_status', coalesce((select pg_catalog.jsonb_object_agg(s, n) from (select r.status::text as s, count(*) as n from public.reservations r group by 1) x), '{}'::jsonb)),
    'dishes', (select count(*) from public.menu_items),
    'payments', coalesce((select pg_catalog.jsonb_object_agg(s, n) from (select e.status as s, count(*) as n from private.payment_events e group by 1) x), '{}'::jsonb),
    'notifications', coalesce((select pg_catalog.jsonb_object_agg(s, n) from (select o.status as s, count(*) as n from private.notification_outbox o group by 1) x), '{}'::jsonb));
end;
$$;

-- ───────────────────────── Suscripciones ─────────────────────────
create or replace function private.admin_subscriptions_list_impl(p_filter text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  if p_filter not in ('all', 'trial_ending', 'trialing', 'active', 'past_due', 'canceled') or p_limit not between 1 and 100 or p_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'invalid_filter';
  end if;
  return (
    with rows as (
      select t.id, t.slug, t.name, s.status::text as status, s.trial_ends_at, s.current_period_ends_at,
             (select u.email from public.tenant_members tm join auth.users u on u.id = tm.user_id where tm.tenant_id = t.id order by tm.created_at limit 1) as owner_email
      from public.tenant_subscriptions s
      join public.tenants t on t.id = s.tenant_id
      where case p_filter
              when 'all' then true
              when 'trial_ending' then s.status = 'trialing' and s.trial_ends_at < pg_catalog.now() + interval '14 days'
              else s.status::text = p_filter
            end
    ), page as (
      select * from rows order by coalesce(trial_ends_at, current_period_ends_at) asc nulls last, pg_catalog.lower(name), id limit p_limit offset p_offset
    )
    select pg_catalog.jsonb_build_object('total', (select count(*) from rows), 'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)) from page p), '[]'::jsonb)));
end;
$$;

-- ───────────────────────── Auditoría ─────────────────────────
create or replace function private.admin_audit_log_list_impl(p_action text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_action text := nullif(pg_catalog.btrim(pg_catalog.left(coalesce(p_action, ''), 60)), '');
begin
  perform private.require_platform_admin();
  if p_limit not between 1 and 100 or p_offset not between 0 and 100000 then
    raise exception using errcode = 'P0001', message = 'invalid_filter';
  end if;
  return pg_catalog.jsonb_build_object(
    'total', (select count(*) from private.admin_audit_log l where v_action is null or l.action = v_action),
    'actions', coalesce((select pg_catalog.jsonb_agg(a order by a) from (select distinct l.action as a from private.admin_audit_log l) x), '[]'::jsonb),
    'items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'at', r.created_at, 'action', r.action, 'actor', r.actor_email,
               'tenant_id', r.tenant_id, 'tenant_name', r.tenant_name, 'detail', r.detail) order by r.created_at desc, r.id desc)
      from (
        select l.id, l.created_at, l.action, u.email as actor_email, l.tenant_id, t.name as tenant_name, l.detail
        from private.admin_audit_log l
        left join auth.users u on u.id = l.actor_id
        left join public.tenants t on t.id = l.tenant_id
        where v_action is null or l.action = v_action
        order by l.created_at desc, l.id desc
        limit p_limit offset p_offset) r), '[]'::jsonb));
end;
$$;

-- ───────────────────────── Usuarios ─────────────────────────
create or replace function private.admin_users_list_impl(p_q text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(pg_catalog.btrim(pg_catalog.left(coalesce(p_q, ''), 80)), '');
begin
  perform private.require_platform_admin();
  if p_limit not between 1 and 100 or p_offset not between 0 and 100000 then
    raise exception using errcode = 'P0001', message = 'invalid_filter';
  end if;
  return (
    with rows as (
      select u.id, u.email, u.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null) as confirmed,
             (select count(*) from public.tenant_members tm where tm.user_id = u.id) as tenants,
             exists (select 1 from private.platform_admins a where a.user_id = u.id) as is_admin
      from auth.users u
      where v_q is null or u.email ilike '%' || pg_catalog.replace(pg_catalog.replace(v_q, '%', ''), '_', '') || '%'
    ), page as (
      select * from rows order by created_at desc, id limit p_limit offset p_offset
    )
    select pg_catalog.jsonb_build_object('total', (select count(*) from rows), 'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)) from page p), '[]'::jsonb)));
end;
$$;

-- ───────────────────────── Administradores ─────────────────────────
create or replace function private.admin_list_admins_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('user_id', a.user_id, 'email', u.email, 'since', a.created_at) order by a.created_at)
                   from private.platform_admins a left join auth.users u on u.id = a.user_id), '[]'::jsonb);
end;
$$;

create or replace function private.admin_add_admin_impl(p_email text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_target uuid;
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  -- Solo una cuenta que ya existe y confirmó su email (la persona se registra primero por su cuenta).
  select u.id into v_target from auth.users u where pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))) and u.email_confirmed_at is not null;
  if v_target is null then
    raise exception using errcode = 'P0001', message = 'user_not_found';
  end if;
  insert into private.platform_admins (user_id) values (v_target) on conflict do nothing;
  insert into private.admin_audit_log (actor_id, action, detail)
  values (v_uid, 'admin_added', pg_catalog.jsonb_build_object('user_id', v_target, 'reason', v_reason));
  return pg_catalog.jsonb_build_object('user_id', v_target);
end;
$$;

create or replace function private.admin_remove_admin_impl(p_user_id uuid, p_reason text)
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
  if char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  if p_user_id = v_uid then
    raise exception using errcode = 'P0001', message = 'cannot_remove_self';
  end if;
  if (select count(*) from private.platform_admins) <= 1 then
    raise exception using errcode = 'P0001', message = 'last_admin';
  end if;
  delete from private.platform_admins where user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'admin_not_found';
  end if;
  insert into private.admin_audit_log (actor_id, action, detail)
  values (v_uid, 'admin_removed', pg_catalog.jsonb_build_object('user_id', p_user_id, 'reason', v_reason));
  return pg_catalog.jsonb_build_object('removed', true);
end;
$$;

-- ───────────────────────── Sistema (pagos, avisos, ajustes) ─────────────────────────
create or replace function private.admin_system_status_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return pg_catalog.jsonb_build_object(
    'settings', (select pg_catalog.jsonb_build_object('public_menu_when_access_lapsed', s.public_menu_when_access_lapsed,
                   'notifications_secret_set', s.notification_worker_secret_sha256 is not null,
                   'payments_secret_set', s.payment_worker_secret_sha256 is not null) from private.settings s limit 1),
    'payment_events', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', e.received_at, 'provider', e.provider, 'kind', e.kind,
                         'status', e.status, 'resource_id', e.resource_id, 'error', e.last_error) order by e.received_at desc)
                       from (select * from private.payment_events order by received_at desc limit 20) e), '[]'::jsonb),
    -- El destinatario se muestra enmascarado: la consola no necesita el email completo del comensal.
    'notifications', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', o.created_at, 'kind', o.kind, 'status', o.status, 'attempts', o.attempts,
                         'recipient', pg_catalog.regexp_replace(o.recipient, '^(.).*(@.*)$', '\1***\2'), 'error', o.last_error) order by o.created_at desc)
                       from (select * from private.notification_outbox order by created_at desc limit 20) o), '[]'::jsonb));
end;
$$;

create or replace function private.admin_set_platform_setting_impl(p_key text, p_value text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_before text;
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  if p_key is distinct from 'public_menu_when_access_lapsed' or p_value not in ('visible', 'hidden') then
    raise exception using errcode = 'P0001', message = 'invalid_setting';
  end if;
  select s.public_menu_when_access_lapsed into v_before from private.settings s limit 1;
  update private.settings set public_menu_when_access_lapsed = p_value, updated_at = pg_catalog.now();
  insert into private.admin_audit_log (actor_id, action, detail)
  values (v_uid, 'setting_changed', pg_catalog.jsonb_build_object('key', p_key, 'before', v_before, 'after', p_value, 'reason', v_reason));
  return pg_catalog.jsonb_build_object('key', p_key, 'value', p_value);
end;
$$;

-- ───────────────────────── Wrappers expuestos (SECURITY INVOKER) ─────────────────────────
create or replace function public.admin_platform_overview() returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_platform_overview_impl(); $$;
create or replace function public.admin_subscriptions_list(p_filter text default 'trial_ending', p_limit integer default 50, p_offset integer default 0) returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_subscriptions_list_impl(p_filter, p_limit, p_offset); $$;
create or replace function public.admin_audit_log_list(p_action text default null, p_limit integer default 50, p_offset integer default 0) returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_audit_log_list_impl(p_action, p_limit, p_offset); $$;
create or replace function public.admin_users_list(p_q text default null, p_limit integer default 50, p_offset integer default 0) returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_users_list_impl(p_q, p_limit, p_offset); $$;
create or replace function public.admin_list_admins() returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_list_admins_impl(); $$;
create or replace function public.admin_add_admin(p_email text, p_reason text default '') returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_add_admin_impl(p_email, p_reason); $$;
create or replace function public.admin_remove_admin(p_user_id uuid, p_reason text default '') returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_remove_admin_impl(p_user_id, p_reason); $$;
create or replace function public.admin_system_status() returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_system_status_impl(); $$;
create or replace function public.admin_set_platform_setting(p_key text, p_value text, p_reason text default '') returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_set_platform_setting_impl(p_key, p_value, p_reason); $$;

revoke all on function private.admin_platform_overview_impl() from public;
revoke all on function private.admin_subscriptions_list_impl(text, integer, integer) from public;
revoke all on function private.admin_audit_log_list_impl(text, integer, integer) from public;
revoke all on function private.admin_users_list_impl(text, integer, integer) from public;
revoke all on function private.admin_list_admins_impl() from public;
revoke all on function private.admin_add_admin_impl(text, text) from public;
revoke all on function private.admin_remove_admin_impl(uuid, text) from public;
revoke all on function private.admin_system_status_impl() from public;
revoke all on function private.admin_set_platform_setting_impl(text, text, text) from public;
revoke all on function public.admin_platform_overview() from public;
revoke all on function public.admin_subscriptions_list(text, integer, integer) from public;
revoke all on function public.admin_audit_log_list(text, integer, integer) from public;
revoke all on function public.admin_users_list(text, integer, integer) from public;
revoke all on function public.admin_list_admins() from public;
revoke all on function public.admin_add_admin(text, text) from public;
revoke all on function public.admin_remove_admin(uuid, text) from public;
revoke all on function public.admin_system_status() from public;
revoke all on function public.admin_set_platform_setting(text, text, text) from public;
grant execute on function private.admin_platform_overview_impl() to authenticated;
grant execute on function private.admin_subscriptions_list_impl(text, integer, integer) to authenticated;
grant execute on function private.admin_audit_log_list_impl(text, integer, integer) to authenticated;
grant execute on function private.admin_users_list_impl(text, integer, integer) to authenticated;
grant execute on function private.admin_list_admins_impl() to authenticated;
grant execute on function private.admin_add_admin_impl(text, text) to authenticated;
grant execute on function private.admin_remove_admin_impl(uuid, text) to authenticated;
grant execute on function private.admin_system_status_impl() to authenticated;
grant execute on function private.admin_set_platform_setting_impl(text, text, text) to authenticated;
grant execute on function public.admin_platform_overview() to authenticated;
grant execute on function public.admin_subscriptions_list(text, integer, integer) to authenticated;
grant execute on function public.admin_audit_log_list(text, integer, integer) to authenticated;
grant execute on function public.admin_users_list(text, integer, integer) to authenticated;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_add_admin(text, text) to authenticated;
grant execute on function public.admin_remove_admin(uuid, text) to authenticated;
grant execute on function public.admin_system_status() to authenticated;
grant execute on function public.admin_set_platform_setting(text, text, text) to authenticated;

-- ───────────────────────── Alta y baja de comercios ─────────────────────────
-- Alta hecha por la plataforma para una persona que YA tiene cuenta (se registra primero por su cuenta). Mismo resultado que el
-- alta del propio dueño (create_tenant): comercio sin publicar, dueño, moderación en borrador y prueba. Queda auditada.
create or replace function private.admin_create_tenant_impl(p_slug text, p_name text, p_owner_email text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_slug text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_slug, '')));
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_owner uuid;
  v_tenant_id uuid;
  v_trial_days integer;
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$' or v_slug ~ '--' then
    raise exception using errcode = 'P0001', message = 'invalid_slug';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  -- Sin email, el dueño es quien crea (el propio superadmin).
  if nullif(pg_catalog.btrim(coalesce(p_owner_email, '')), '') is null then
    v_owner := v_uid;
  else
    select u.id into v_owner from auth.users u
    where pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(p_owner_email)) and u.email_confirmed_at is not null;
    if v_owner is null then
      raise exception using errcode = 'P0001', message = 'user_not_found';
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sentate:tenant-slug:' || v_slug, 0));
  if exists (select 1 from public.tenants t where t.slug = v_slug) then
    raise exception using errcode = 'P0001', message = 'slug_taken';
  end if;
  begin
    insert into public.tenants (slug, name) values (v_slug, v_name) returning id into v_tenant_id;
  exception when check_violation then
    raise exception using errcode = 'P0001', message = 'invalid_slug';
  end;
  insert into public.tenant_members (tenant_id, user_id, role) values (v_tenant_id, v_owner, 'owner');
  select c.trial_days into v_trial_days from private.plan_config c;
  insert into public.tenant_subscriptions (tenant_id, status, trial_started_at, trial_ends_at)
  values (v_tenant_id, 'trialing', pg_catalog.now(), pg_catalog.now() + pg_catalog.make_interval(days => v_trial_days));
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values (v_uid, 'tenant_created', v_tenant_id, pg_catalog.jsonb_build_object('slug', v_slug, 'name', v_name, 'owner_id', v_owner, 'reason', v_reason));
  return pg_catalog.jsonb_build_object('tenant_id', v_tenant_id, 'slug', v_slug);
end;
$$;

-- Baja DEFINITIVA: borra el comercio y todo lo suyo (carta, horarios, reservas, membresías, favoritos, avisos). No se puede
-- deshacer. Exige escribir el slug exacto y un motivo, y deja el registro en la auditoría (con nombre y slug, porque la
-- ficha ya no existe). Las imágenes del Storage no se borran aquí.
create or replace function private.admin_delete_tenant_impl(p_tenant_id uuid, p_confirm_slug text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_t public.tenants%rowtype;
  v_counts jsonb;
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  select * into v_t from public.tenants t where t.id = p_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'tenant_not_found';
  end if;
  if p_confirm_slug is distinct from v_t.slug then
    raise exception using errcode = 'P0001', message = 'slug_mismatch';
  end if;
  v_counts := pg_catalog.jsonb_build_object(
    'reservations', (select count(*) from public.reservations where tenant_id = p_tenant_id),
    'dishes', (select count(*) from public.menu_items where tenant_id = p_tenant_id));
  delete from public.reservations where tenant_id = p_tenant_id;
  delete from public.menu_items where tenant_id = p_tenant_id;
  delete from public.categories where tenant_id = p_tenant_id;
  delete from public.tenant_closures where tenant_id = p_tenant_id;
  delete from public.tenant_shifts where tenant_id = p_tenant_id;
  delete from public.tenant_members where tenant_id = p_tenant_id;
  delete from public.tenant_moderation where tenant_id = p_tenant_id;
  delete from public.tenant_subscriptions where tenant_id = p_tenant_id;
  delete from public.tenants where id = p_tenant_id;
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values (v_uid, 'tenant_deleted', p_tenant_id, pg_catalog.jsonb_build_object('slug', v_t.slug, 'name', v_t.name, 'deleted', v_counts, 'reason', v_reason));
  return pg_catalog.jsonb_build_object('deleted', true, 'slug', v_t.slug);
end;
$$;

-- ───────────────────────── Promociones ─────────────────────────
-- Una promoción por comercio, con ventana de fechas (máx. 90 días). La carga la plataforma. Se muestra en la carta pública
-- solo mientras está vigente y el comercio es visible (misma regla que la carta).
create table public.tenant_promotions (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 60),
  detail text not null default '' check (char_length(detail) <= 240),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint promotion_window check (ends_at > starts_at and ends_at - starts_at <= interval '90 days')
);
alter table public.tenant_promotions enable row level security;
revoke all on table public.tenant_promotions from anon, authenticated;
grant select (tenant_id, title, detail, starts_at, ends_at) on table public.tenant_promotions to anon, authenticated;
create policy tenant_promotions_select on public.tenant_promotions
  for select to anon, authenticated
  using (pg_catalog.now() >= starts_at and pg_catalog.now() < ends_at and private.is_publicly_visible(tenant_id));

create or replace function private.admin_set_promotion_impl(p_tenant_id uuid, p_title text, p_detail text, p_days integer, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_detail text := pg_catalog.btrim(coalesce(p_detail, ''));
begin
  if char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  if char_length(v_title) not between 3 and 60 or char_length(v_detail) > 240 then
    raise exception using errcode = 'P0001', message = 'invalid_promotion';
  end if;
  if p_days is null or p_days not between 1 and 90 then
    raise exception using errcode = 'P0001', message = 'invalid_days';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception using errcode = 'P0001', message = 'tenant_not_found';
  end if;
  insert into public.tenant_promotions (tenant_id, title, detail, starts_at, ends_at, created_by)
  values (p_tenant_id, v_title, v_detail, pg_catalog.now(), pg_catalog.now() + pg_catalog.make_interval(days => p_days), v_uid)
  on conflict (tenant_id) do update
  set title = excluded.title, detail = excluded.detail, starts_at = excluded.starts_at, ends_at = excluded.ends_at, created_by = excluded.created_by;
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values (v_uid, 'promotion_set', p_tenant_id, pg_catalog.jsonb_build_object('title', v_title, 'days', p_days, 'reason', v_reason));
  return pg_catalog.jsonb_build_object('promotion', true);
end;
$$;

create or replace function private.admin_clear_promotion_impl(p_tenant_id uuid, p_reason text)
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
  if char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  delete from public.tenant_promotions where tenant_id = p_tenant_id;
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values (v_uid, 'promotion_clear', p_tenant_id, pg_catalog.jsonb_build_object('reason', v_reason));
  return pg_catalog.jsonb_build_object('promotion', false);
end;
$$;

-- Datos extra de la ficha: promoción vigente o programada y volumen de uso.
create or replace function private.admin_tenant_extras_impl(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return pg_catalog.jsonb_build_object(
    'promotion', (select pg_catalog.jsonb_build_object('title', p.title, 'detail', p.detail, 'starts_at', p.starts_at, 'ends_at', p.ends_at)
                  from public.tenant_promotions p where p.tenant_id = p_tenant_id),
    'reservations', (select count(*) from public.reservations r where r.tenant_id = p_tenant_id),
    'dishes', (select count(*) from public.menu_items m where m.tenant_id = p_tenant_id));
end;
$$;

create or replace function public.admin_create_tenant(p_slug text, p_name text, p_owner_email text default null, p_reason text default '') returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_create_tenant_impl(p_slug, p_name, p_owner_email, p_reason); $$;
create or replace function public.admin_delete_tenant(p_tenant_id uuid, p_confirm_slug text, p_reason text default '') returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_delete_tenant_impl(p_tenant_id, p_confirm_slug, p_reason); $$;
create or replace function public.admin_set_promotion(p_tenant_id uuid, p_title text, p_detail text, p_days integer, p_reason text default '') returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_set_promotion_impl(p_tenant_id, p_title, p_detail, p_days, p_reason); $$;
create or replace function public.admin_clear_promotion(p_tenant_id uuid, p_reason text default '') returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_clear_promotion_impl(p_tenant_id, p_reason); $$;
create or replace function public.admin_tenant_extras(p_tenant_id uuid) returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_tenant_extras_impl(p_tenant_id); $$;

revoke all on function private.admin_create_tenant_impl(text, text, text, text) from public;
revoke all on function private.admin_delete_tenant_impl(uuid, text, text) from public;
revoke all on function private.admin_set_promotion_impl(uuid, text, text, integer, text) from public;
revoke all on function private.admin_clear_promotion_impl(uuid, text) from public;
revoke all on function private.admin_tenant_extras_impl(uuid) from public;
revoke all on function public.admin_create_tenant(text, text, text, text) from public;
revoke all on function public.admin_delete_tenant(uuid, text, text) from public;
revoke all on function public.admin_set_promotion(uuid, text, text, integer, text) from public;
revoke all on function public.admin_clear_promotion(uuid, text) from public;
revoke all on function public.admin_tenant_extras(uuid) from public;
grant execute on function private.admin_create_tenant_impl(text, text, text, text) to authenticated;
grant execute on function private.admin_delete_tenant_impl(uuid, text, text) to authenticated;
grant execute on function private.admin_set_promotion_impl(uuid, text, text, integer, text) to authenticated;
grant execute on function private.admin_clear_promotion_impl(uuid, text) to authenticated;
grant execute on function private.admin_tenant_extras_impl(uuid) to authenticated;
grant execute on function public.admin_create_tenant(text, text, text, text) to authenticated;
grant execute on function public.admin_delete_tenant(uuid, text, text) to authenticated;
grant execute on function public.admin_set_promotion(uuid, text, text, integer, text) to authenticated;
grant execute on function public.admin_clear_promotion(uuid, text) to authenticated;
grant execute on function public.admin_tenant_extras(uuid) to authenticated;
