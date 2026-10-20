-- Sentate · Fase 2 · 05: helpers de autorización, RLS y grants mínimos.
--
-- Helpers SECURITY DEFINER en `private` (no expuesto) — justificación:
--  * Evitan recursión de RLS al consultar tenant_members desde políticas de otras tablas.
--  * El visitante anónimo no tiene acceso a tenant_subscriptions, pero la visibilidad pública
--    puede depender del acceso del comercio (private.settings).
-- Todos: search_path = '', nombres cualificados, solo devuelven boolean, identidad = auth.uid().
-- Nunca se lee user_metadata ni se confía en slug/IDs para decidir pertenencia.

-- ¿El usuario autenticado actual es miembro del comercio?
create or replace function private.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id and m.user_id = (select auth.uid())
  );
$$;

-- ¿El comercio tiene acceso operativo AHORA? Se calcula con now(): no depende de un cron
-- que actualice el estado. Una prueba vencida bloquea aunque status siga en 'trialing'.
create or replace function private.tenant_has_operational_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenants t
    join public.tenant_subscriptions s on s.tenant_id = t.id
    where t.id = p_tenant_id
      and t.status = 'active'
      and (
        (s.status = 'trialing' and pg_catalog.now() < s.trial_ends_at)
        or (s.status = 'active' and pg_catalog.now() < s.current_period_ends_at)
      )
  );
$$;

-- Operar = ser miembro + comercio con acceso vigente.
create or replace function private.can_operate(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_tenant_member(p_tenant_id) and private.tenant_has_operational_access(p_tenant_id);
$$;

-- Visible al público: publicado, no suspendido y (según la decisión pendiente) con acceso vigente.
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
      and (
        (select s.public_menu_when_access_lapsed from private.settings s) = 'visible'
        or private.tenant_has_operational_access(t.id)
      )
  );
$$;

revoke all on function private.is_tenant_member(uuid) from public;
revoke all on function private.tenant_has_operational_access(uuid) from public;
revoke all on function private.can_operate(uuid) from public;
revoke all on function private.is_publicly_visible(uuid) from public;
-- EXECUTE necesario para evaluar las políticas con el rol del que consulta.
grant execute on function private.is_tenant_member(uuid) to authenticated;
grant execute on function private.can_operate(uuid) to authenticated;
grant execute on function private.tenant_has_operational_access(uuid) to authenticated;
grant execute on function private.is_publicly_visible(uuid) to anon, authenticated;
grant execute on function private.is_valid_timezone(text) to authenticated;
grant execute on function private.shift_minutes(time, time) to authenticated;

-- ───────────────────────── RLS en todas las tablas ─────────────────────────
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.tenant_shifts enable row level security;
alter table public.tenant_closures enable row level security;
alter table public.reservations enable row level security;
alter table private.settings enable row level security;
alter table private.plan_config enable row level security;

-- Por si el proyecto aún tiene grants por defecto: partir de cero y otorgar lo mínimo.
revoke all on table public.tenants, public.tenant_members, public.tenant_subscriptions, public.categories,
  public.menu_items, public.tenant_shifts, public.tenant_closures, public.reservations
  from anon, authenticated;
revoke all on table private.settings, private.plan_config from anon, authenticated;

-- service_role: uso server-side confiable (soporte, futuros webhooks de pago). Nunca en el navegador.
grant select, insert, update, delete on table public.tenants, public.tenant_members, public.tenant_subscriptions,
  public.categories, public.menu_items, public.tenant_shifts, public.tenant_closures, public.reservations
  to service_role;

-- ───────────────────────── tenants ─────────────────────────
grant select on table public.tenants to anon, authenticated;
-- UPDATE por columnas: no se puede tocar id, status ni timestamps. Cambiar slug no cambia la identidad (id).
grant update (slug, name, tagline, cuisine, price_range, address, phone, timezone, logo_url, cover_url,
  primary_color, primary_fg_color, accent_color, accent_fg_color, is_published)
  on table public.tenants to authenticated;
-- Sin INSERT/DELETE: el alta pasa por public.create_tenant(); la baja queda fuera del MVP.

-- Una política SELECT por rol (evita políticas permisivas múltiples, advisor 0006).
create policy tenants_select_anon on public.tenants
  for select to anon
  using (private.is_publicly_visible(id));
-- Autenticado: lo público + su comercio siempre (también vencido o sin publicar: cuenta y suscripción).
create policy tenants_select_authenticated on public.tenants
  for select to authenticated
  using (private.is_publicly_visible(id) or private.is_tenant_member(id));

create policy tenants_update_operator on public.tenants
  for update to authenticated
  using (private.can_operate(id))
  with check (private.can_operate(id));

-- ───────────────────────── tenant_members ─────────────────────────
grant select on table public.tenant_members to authenticated;
-- Sin INSERT/UPDATE/DELETE para clientes: nadie se autoasigna membresías ni eleva su rol.
create policy tenant_members_select_own on public.tenant_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ───────────────────────── tenant_subscriptions ─────────────────────────
grant select on table public.tenant_subscriptions to authenticated;
-- Solo lectura para miembros (pantalla de suscripción). Escritura: solo funciones confiables / service_role.
create policy tenant_subscriptions_select_member on public.tenant_subscriptions
  for select to authenticated
  using (private.is_tenant_member(tenant_id));

-- ───────────────────────── categories ─────────────────────────
grant select on table public.categories to anon, authenticated;
grant insert (tenant_id, name, position, is_visible) on table public.categories to authenticated;
grant update (name, position, is_visible) on table public.categories to authenticated;
grant delete on table public.categories to authenticated;

create policy categories_select_anon on public.categories
  for select to anon
  using (is_visible and private.is_publicly_visible(tenant_id));
create policy categories_select_authenticated on public.categories
  for select to authenticated
  using ((is_visible and private.is_publicly_visible(tenant_id)) or private.can_operate(tenant_id));
create policy categories_insert_operator on public.categories
  for insert to authenticated
  with check (private.can_operate(tenant_id));
create policy categories_update_operator on public.categories
  for update to authenticated
  using (private.can_operate(tenant_id))
  with check (private.can_operate(tenant_id));
create policy categories_delete_operator on public.categories
  for delete to authenticated
  using (private.can_operate(tenant_id));

-- ───────────────────────── menu_items ─────────────────────────
grant select on table public.menu_items to anon, authenticated;
grant insert (tenant_id, category_id, name, description, price, currency, image_url, tags, is_available, position)
  on table public.menu_items to authenticated;
-- category_id editable (mover de categoría); la FK compuesta impide apuntar a otro comercio.
grant update (category_id, name, description, price, currency, image_url, tags, is_available, position)
  on table public.menu_items to authenticated;
grant delete on table public.menu_items to authenticated;

create policy menu_items_select_anon on public.menu_items
  for select to anon
  using (
    is_available
    and private.is_publicly_visible(tenant_id)
    and exists (
      select 1 from public.categories c
      where c.tenant_id = menu_items.tenant_id and c.id = menu_items.category_id and c.is_visible
    )
  );
create policy menu_items_select_authenticated on public.menu_items
  for select to authenticated
  using (
    private.can_operate(tenant_id)
    or (
      is_available
      and private.is_publicly_visible(tenant_id)
      and exists (
        select 1 from public.categories c
        where c.tenant_id = menu_items.tenant_id and c.id = menu_items.category_id and c.is_visible
      )
    )
  );
create policy menu_items_insert_operator on public.menu_items
  for insert to authenticated
  with check (private.can_operate(tenant_id));
create policy menu_items_update_operator on public.menu_items
  for update to authenticated
  using (private.can_operate(tenant_id))
  with check (private.can_operate(tenant_id));
create policy menu_items_delete_operator on public.menu_items
  for delete to authenticated
  using (private.can_operate(tenant_id));

-- ───────────────────────── horarios ─────────────────────────
grant select on table public.tenant_shifts, public.tenant_closures to anon, authenticated;
grant insert (tenant_id, weekday, label, opens_at, closes_at) on table public.tenant_shifts to authenticated;
grant update (weekday, label, opens_at, closes_at) on table public.tenant_shifts to authenticated;
grant delete on table public.tenant_shifts to authenticated;
grant insert (tenant_id, service_date, reason) on table public.tenant_closures to authenticated;
grant update (service_date, reason) on table public.tenant_closures to authenticated;
grant delete on table public.tenant_closures to authenticated;

create policy tenant_shifts_select_anon on public.tenant_shifts
  for select to anon using (private.is_publicly_visible(tenant_id));
create policy tenant_shifts_select_authenticated on public.tenant_shifts
  for select to authenticated using (private.is_publicly_visible(tenant_id) or private.can_operate(tenant_id));
create policy tenant_shifts_insert_operator on public.tenant_shifts
  for insert to authenticated with check (private.can_operate(tenant_id));
create policy tenant_shifts_update_operator on public.tenant_shifts
  for update to authenticated using (private.can_operate(tenant_id)) with check (private.can_operate(tenant_id));
create policy tenant_shifts_delete_operator on public.tenant_shifts
  for delete to authenticated using (private.can_operate(tenant_id));

create policy tenant_closures_select_anon on public.tenant_closures
  for select to anon using (private.is_publicly_visible(tenant_id));
create policy tenant_closures_select_authenticated on public.tenant_closures
  for select to authenticated using (private.is_publicly_visible(tenant_id) or private.can_operate(tenant_id));
create policy tenant_closures_insert_operator on public.tenant_closures
  for insert to authenticated with check (private.can_operate(tenant_id));
create policy tenant_closures_update_operator on public.tenant_closures
  for update to authenticated using (private.can_operate(tenant_id)) with check (private.can_operate(tenant_id));
create policy tenant_closures_delete_operator on public.tenant_closures
  for delete to authenticated using (private.can_operate(tenant_id));

-- ───────────────────────── reservations ─────────────────────────
-- anon: ningún privilegio. Las solicitudes públicas entran solo por public.request_reservation().
grant select on table public.reservations to authenticated;
-- El dueño solo cambia el estado (transiciones validadas por trigger).
grant update (status) on table public.reservations to authenticated;

create policy reservations_select_operator on public.reservations
  for select to authenticated
  using (private.can_operate(tenant_id));
create policy reservations_update_operator on public.reservations
  for update to authenticated
  using (private.can_operate(tenant_id))
  with check (private.can_operate(tenant_id));
-- Sin políticas de INSERT/DELETE para clientes.
