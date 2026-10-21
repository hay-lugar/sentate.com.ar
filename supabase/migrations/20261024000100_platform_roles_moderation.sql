-- {Sin Nombre} · Explorador · Etapa A: rol de plataforma, moderación, suspensión, visibilidad y auditoría.
--
-- Cuatro ejes independientes (no hay un único booleano):
--   moderación   → public.tenant_moderation.status (la decide un superadministrador)
--   publicación  → public.tenants.is_published     (la decide el dueño)
--   suscripción  → public.tenant_subscriptions     (prueba / pago; acceso operativo calculado con now())
--   suspensión   → public.tenants.status = 'suspended' (administrativa) + motivo en tenant_moderation
--
-- Visibilidad:
--   carta pública (/[slug])  = publicado + no suspendido + no rechazado + política de acceso vencido
--   explorador (is_listed)   = carta visible + moderación 'approved' + acceso operativo vigente
--                              (la etapa B suma "ubicación confirmada")

-- ───────────────────────── Rol de plataforma ─────────────────────────
-- Separado de tenant_members. Sin grants ni políticas: solo se escribe con acceso directo a la base
-- (alta inicial documentada en docs/explorador-diseno.md). Nunca se deriva de user_metadata.
create table private.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.platform_admins enable row level security;
revoke all on table private.platform_admins from anon, authenticated;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.platform_admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to authenticated;

-- ───────────────────────── Auditoría ─────────────────────────
create table private.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  tenant_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table private.admin_audit_log enable row level security;
revoke all on table private.admin_audit_log from anon, authenticated;
create index admin_audit_log_tenant_idx on private.admin_audit_log (tenant_id, created_at desc);

-- ───────────────────────── Moderación ─────────────────────────
create type public.moderation_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'changes_requested');

create table public.tenant_moderation (
  tenant_id uuid primary key references public.tenants (id) on delete restrict,
  status public.moderation_status not null default 'draft',
  -- Motivo visible para el dueño (rechazo / correcciones / nueva revisión).
  reason text not null default '',
  suspension_reason text not null default '',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  updated_at timestamptz not null default now(),
  constraint tenant_moderation_reason_len check (char_length(reason) <= 500 and char_length(suspension_reason) <= 500)
);
comment on table public.tenant_moderation is
  'Estado de moderación del comercio. El dueño solo lo lee; se escribe por funciones confiables.';
alter table public.tenant_moderation enable row level security;
revoke all on table public.tenant_moderation from anon, authenticated;
grant select on table public.tenant_moderation to authenticated;
grant select, insert, update, delete on table public.tenant_moderation to service_role;
create policy tenant_moderation_select on public.tenant_moderation
  for select to authenticated
  using (private.is_tenant_member(tenant_id) or private.is_platform_admin());
create trigger tenant_moderation_set_updated_at before update on public.tenant_moderation
  for each row execute function private.set_updated_at();

-- Cada comercio tiene su fila de moderación (borrador) desde el alta; los existentes quedan en borrador.
create or replace function private.tenants_create_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_moderation (tenant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.tenants_create_moderation() from public;
create trigger tenants_create_moderation after insert on public.tenants
  for each row execute function private.tenants_create_moderation();
insert into public.tenant_moderation (tenant_id) select t.id from public.tenants t on conflict do nothing;

-- Cambio material (nombre o dirección) de un comercio aprobado → vuelve a revisión.
-- La carta y las reservas existentes NO se interrumpen: solo sale del explorador hasta nueva aprobación.
create or replace function private.tenants_material_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.name is distinct from old.name or new.address is distinct from old.address) then
    update public.tenant_moderation m
    set status = 'pending_review', submitted_at = pg_catalog.now(),
        reason = 'Cambió el nombre o la dirección: se revisa de nuevo.'
    where m.tenant_id = new.id and m.status = 'approved';
  end if;
  return new;
end;
$$;
revoke all on function private.tenants_material_change() from public;
create trigger tenants_material_change after update of name, address on public.tenants
  for each row execute function private.tenants_material_change();

-- ───────────────────────── Visibilidad ─────────────────────────
-- Carta pública: ahora también excluye comercios rechazados por moderación.
create or replace function private.is_publicly_visible(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenants t
    where t.id = p_tenant_id
      and t.is_published
      and t.status = 'active'
      and not exists (select 1 from public.tenant_moderation m where m.tenant_id = t.id and m.status = 'rejected')
      and (
        (select s.public_menu_when_access_lapsed from private.settings s) = 'visible'
        or private.tenant_has_operational_access(t.id)
      )
  );
$$;

-- Regla única de listado en el explorador (lista, mapa, búsqueda y cualquier endpoint).
create or replace function private.is_listed(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_publicly_visible(p_tenant_id)
    and private.tenant_has_operational_access(p_tenant_id)
    and exists (select 1 from public.tenant_moderation m where m.tenant_id = p_tenant_id and m.status = 'approved');
$$;
revoke all on function private.is_listed(uuid) from public;
grant execute on function private.is_listed(uuid) to anon, authenticated;

-- ───────────────────────── Slugs reservados (rutas de la app) ─────────────────────────
alter table public.tenants drop constraint tenants_slug_not_reserved;
alter table public.tenants add constraint tenants_slug_not_reserved check (
  slug not in ('admin', 'api', 'app', 'auth', 'login', 'logout', 'signup', 'registro', 'precio',
               'precios', 'demo', 'static', 'assets', 'public', 'www', 'sentate', 'soporte', 'ayuda',
               'explorar', 'superadmin', 'cuenta', 'perfil', 'favoritos', 'mis-reservas', 'reservas',
               'buscar', 'mapa', 'recuperar')
) not valid;

-- ───────────────────────── Operaciones ─────────────────────────
create or replace function private.submit_for_review_impl(p_tenant_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status public.moderation_status;
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
  update public.tenant_moderation
  set status = 'pending_review', submitted_at = pg_catalog.now(), reason = ''
  where tenant_id = p_tenant_id;
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values ((select auth.uid()), 'submit_for_review', p_tenant_id, pg_catalog.jsonb_build_object('from', v_status));
  return pg_catalog.jsonb_build_object('status', 'pending_review');
end;
$$;

create or replace function private.admin_review_tenant_impl(p_tenant_id uuid, p_decision text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_new public.moderation_status;
  v_old public.moderation_status;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  -- Nadie modera su propio comercio.
  if exists (select 1 from public.tenant_members mm where mm.tenant_id = p_tenant_id and mm.user_id = v_uid) then
    raise exception using errcode = '42501', message = 'cannot_review_own_tenant';
  end if;
  v_new := case p_decision
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    when 'request_changes' then 'changes_requested'
    else null end;
  if v_new is null then
    raise exception using errcode = 'P0001', message = 'invalid_decision';
  end if;
  if v_new <> 'approved' and char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  select m.status into v_old from public.tenant_moderation m where m.tenant_id = p_tenant_id for update;
  if v_old is distinct from 'pending_review' then
    raise exception using errcode = 'P0001', message = 'invalid_moderation_transition';
  end if;
  update public.tenant_moderation
  set status = v_new, reason = case when v_new = 'approved' then '' else v_reason end,
      reviewed_at = pg_catalog.now(), reviewed_by = v_uid
  where tenant_id = p_tenant_id;
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values (v_uid, 'review_' || p_decision, p_tenant_id, pg_catalog.jsonb_build_object('reason', v_reason));
  return pg_catalog.jsonb_build_object('status', v_new);
end;
$$;

create or replace function private.admin_set_suspension_impl(p_tenant_id uuid, p_suspended boolean, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_suspended and char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'reason_required';
  end if;
  update public.tenants set status = case when p_suspended then 'suspended'::public.tenant_status else 'active'::public.tenant_status end
  where id = p_tenant_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'tenant_not_found';
  end if;
  update public.tenant_moderation
  set suspension_reason = case when p_suspended then v_reason else '' end
  where tenant_id = p_tenant_id;
  insert into private.admin_audit_log (actor_id, action, tenant_id, detail)
  values (v_uid, case when p_suspended then 'suspend' else 'reactivate' end, p_tenant_id,
          pg_catalog.jsonb_build_object('reason', v_reason));
  return pg_catalog.jsonb_build_object('suspended', p_suspended);
end;
$$;

-- Wrappers expuestos (SECURITY INVOKER); la autorización real vive en las funciones privadas.
create or replace function public.submit_for_review(p_tenant_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.submit_for_review_impl(p_tenant_id); $$;
create or replace function public.admin_review_tenant(p_tenant_id uuid, p_decision text, p_reason text default '')
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_review_tenant_impl(p_tenant_id, p_decision, p_reason); $$;
create or replace function public.admin_set_suspension(p_tenant_id uuid, p_suspended boolean, p_reason text default '')
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.admin_set_suspension_impl(p_tenant_id, p_suspended, p_reason); $$;

revoke all on function private.submit_for_review_impl(uuid) from public;
revoke all on function private.admin_review_tenant_impl(uuid, text, text) from public;
revoke all on function private.admin_set_suspension_impl(uuid, boolean, text) from public;
revoke all on function public.submit_for_review(uuid) from public;
revoke all on function public.admin_review_tenant(uuid, text, text) from public;
revoke all on function public.admin_set_suspension(uuid, boolean, text) from public;
grant execute on function private.submit_for_review_impl(uuid) to authenticated;
grant execute on function private.admin_review_tenant_impl(uuid, text, text) to authenticated;
grant execute on function private.admin_set_suspension_impl(uuid, boolean, text) to authenticated;
grant execute on function public.submit_for_review(uuid) to authenticated;
grant execute on function public.admin_review_tenant(uuid, text, text) to authenticated;
grant execute on function public.admin_set_suspension(uuid, boolean, text) to authenticated;
