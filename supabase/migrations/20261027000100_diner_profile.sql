-- {Sin Nombre} · Explorador · Etapa D: perfil del comensal, favoritos, historial y cancelación.
--
-- Una persona puede ser comensal y dueña con UNA sola identidad (auth.users). Iniciar sesión como comensal no otorga
-- ningún permiso sobre comercios: los permisos de operación siguen saliendo de tenant_members.
-- Las solicitudes sin cuenta siguen funcionando (user_id nulo). Las reservas viejas NO se asocian por teléfono ni email
-- escritos: solo se vincula lo pedido con la sesión validada.

-- ───────────────────────── Reservas vinculadas a la sesión ─────────────────────────
alter table public.reservations add column user_id uuid references auth.users (id) on delete set null;
create index reservations_user_idx on public.reservations (user_id, starts_at desc) where user_id is not null;

-- El vínculo lo pone el servidor con auth.uid() (JWT verificado), nunca el cliente: no es columna escribible ni parámetro.
create or replace function private.reservations_link_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if new.user_id is null and v_uid is not null and exists (select 1 from auth.users u where u.id = v_uid) then
    new.user_id := v_uid;
  end if;
  return new;
end;
$$;
revoke all on function private.reservations_link_user() from public;
create trigger reservations_link_user before insert on public.reservations
  for each row execute function private.reservations_link_user();

-- user_id es inmutable salvo el desvínculo por baja de la cuenta (ON DELETE SET NULL, que no pasa por este trigger de usuario).
create or replace function private.reservations_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id <> old.tenant_id or new.starts_at <> old.starts_at or new.service_date <> old.service_date
     or new.idempotency_key is distinct from old.idempotency_key
     or new.request_fingerprint is distinct from old.request_fingerprint
     or new.created_at <> old.created_at
     or (new.user_id is distinct from old.user_id and new.user_id is not null) then
    raise exception using errcode = '42501', message = 'reservation_immutable_field';
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'rejected', 'cancelled'))
      or (old.status = 'confirmed' and new.status = 'cancelled')
    ) then
      raise exception using errcode = '23514', message = 'invalid_status_transition',
        detail = format('%s -> %s', old.status, new.status);
    end if;
    new.decided_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

-- Regla de cancelación del comensal: una solicitud pendiente se retira hasta la hora de la reserva; una confirmada,
-- hasta N horas antes (configurable por comercio; por defecto 2).
alter table public.tenants add column diner_cancel_cutoff_hours smallint not null default 2;
alter table public.tenants add constraint tenants_diner_cancel_cutoff check (diner_cancel_cutoff_hours between 0 and 72);
grant update (diner_cancel_cutoff_hours) on table public.tenants to authenticated;

-- ───────────────────────── Perfil básico ─────────────────────────
create table public.diner_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  phone text not null default '',
  updated_at timestamptz not null default now(),
  constraint diner_profiles_name_len check (char_length(display_name) <= 80),
  constraint diner_profiles_phone_format check (phone = '' or phone ~ '^[0-9 ()+-]{8,24}$')
);
create trigger diner_profiles_set_updated_at before update on public.diner_profiles
  for each row execute function private.set_updated_at();
alter table public.diner_profiles enable row level security;
revoke all on table public.diner_profiles from anon, authenticated;
grant select, insert (user_id, display_name, phone), update (display_name, phone) on table public.diner_profiles to authenticated;
grant select, insert, update, delete on table public.diner_profiles to service_role;
create policy diner_profiles_select_own on public.diner_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy diner_profiles_insert_own on public.diner_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy diner_profiles_update_own on public.diner_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────────────────── Favoritos (privados) ─────────────────────────
create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
create index favorites_tenant_idx on public.favorites (tenant_id);
alter table public.favorites enable row level security;
revoke all on table public.favorites from anon, authenticated;
grant select, delete on table public.favorites to authenticated;
grant select, insert, update, delete on table public.favorites to service_role;
create policy favorites_select_own on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy favorites_delete_own on public.favorites for delete to authenticated using (user_id = (select auth.uid()));

create or replace function private.set_favorite_impl(p_tenant_id uuid, p_on boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if p_on then
    if not private.is_publicly_visible(p_tenant_id) then
      raise exception using errcode = 'P0001', message = 'tenant_unavailable';
    end if;
    if (select count(*) from public.favorites f where f.user_id = v_uid) >= 100 then
      raise exception using errcode = 'P0001', message = 'too_many_favorites';
    end if;
    insert into public.favorites (user_id, tenant_id) values (v_uid, p_tenant_id) on conflict do nothing;
  else
    delete from public.favorites where user_id = v_uid and tenant_id = p_tenant_id;
  end if;
  return pg_catalog.jsonb_build_object('favorite', p_on);
end;
$$;

-- Favoritos que siguen siendo visibles al público (un comercio oculto desaparece de la lista sin borrar el vínculo).
create or replace function private.my_favorites_impl()
returns jsonb
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
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'name', t.name, 'tagline', t.tagline, 'business_type', t.business_type,
      'price_range', t.price_range, 'cover_url', t.cover_url, 'logo_url', t.logo_url,
      'locality', l.locality, 'listed', private.is_listed(t.id)) order by f.created_at desc)
    from public.favorites f
    join public.tenants t on t.id = f.tenant_id
    left join public.tenant_locations l on l.tenant_id = t.id
    where f.user_id = v_uid and private.is_publicly_visible(t.id)
  ), '[]'::jsonb);
end;
$$;

-- ───────────────────────── Historial y cancelación ─────────────────────────
-- Estado mostrado: «finalizada» y «sin respuesta» se derivan (no hay un cron que las escriba); la etapa E reemplaza la
-- duración fija por la ocupación configurada.
create or replace function private.my_reservations_impl(p_id uuid, p_limit integer, p_offset integer)
returns jsonb
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
  if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'invalid_filter';
  end if;
  return pg_catalog.jsonb_build_object(
    'total', (select count(*) from public.reservations r where r.user_id = v_uid and (p_id is null or r.id = p_id)),
    'items', coalesce((
      select pg_catalog.jsonb_agg(x.item order by x.starts_at desc)
      from (
        select r.starts_at,
               pg_catalog.jsonb_build_object(
                 'id', r.id, 'status', r.status,
                 'display_status', case
                    when r.status = 'confirmed' and r.starts_at + interval '3 hours' < pg_catalog.now() then 'finished'
                    when r.status = 'pending' and r.starts_at < pg_catalog.now() then 'expired'
                    else r.status::text end,
                 'starts_at', r.starts_at, 'service_date', r.service_date, 'guests', r.guests, 'notes', r.notes,
                 'created_at', r.created_at, 'decided_at', r.decided_at,
                 'can_cancel', (r.status in ('pending', 'confirmed') and r.starts_at > pg_catalog.now()
                                and (r.status = 'pending'
                                     or r.starts_at - pg_catalog.make_interval(hours => t.diner_cancel_cutoff_hours) > pg_catalog.now())),
                 'cancel_cutoff_hours', t.diner_cancel_cutoff_hours,
                 'tenant', pg_catalog.jsonb_build_object('slug', t.slug, 'name', t.name, 'address', t.address, 'phone', t.phone,
                                                          'timezone', t.timezone, 'visible', private.is_publicly_visible(t.id))
               ) as item
        from public.reservations r
        join public.tenants t on t.id = r.tenant_id
        where r.user_id = v_uid and (p_id is null or r.id = p_id)
        order by r.starts_at desc
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb));
end;
$$;

create or replace function private.cancel_my_reservation_impl(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_r public.reservations%rowtype;
  v_cutoff smallint;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  -- Ajena e inexistente responden igual: no se confirma que un id exista.
  select * into v_r from public.reservations r where r.id = p_id and r.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if v_r.status not in ('pending', 'confirmed') or v_r.starts_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'cannot_cancel';
  end if;
  select t.diner_cancel_cutoff_hours into v_cutoff from public.tenants t where t.id = v_r.tenant_id;
  if v_r.status = 'confirmed' and v_r.starts_at - pg_catalog.make_interval(hours => v_cutoff) <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'cancel_too_late';
  end if;
  update public.reservations set status = 'cancelled' where id = v_r.id;
  return pg_catalog.jsonb_build_object('status', 'cancelled');
end;
$$;

-- Baja de la cuenta de comensal. Las reservas quedan en el comercio sin vínculo (user_id nulo). Una cuenta que opera
-- un comercio no puede darse de baja así: dejaría el comercio sin dueño.
create or replace function private.delete_my_account_impl()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if exists (select 1 from public.tenant_members m where m.tenant_id is not null and m.user_id = v_uid)
     or exists (select 1 from private.platform_admins a where a.user_id = v_uid) then
    raise exception using errcode = 'P0001', message = 'account_has_responsibilities';
  end if;
  delete from auth.users where id = v_uid;
  return pg_catalog.jsonb_build_object('deleted', true);
end;
$$;

-- Wrappers expuestos (SECURITY INVOKER).
create or replace function public.set_favorite(p_tenant_id uuid, p_on boolean)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.set_favorite_impl(p_tenant_id, p_on); $$;
create or replace function public.my_favorites()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.my_favorites_impl(); $$;
create or replace function public.my_reservations(p_id uuid default null, p_limit integer default 30, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.my_reservations_impl(p_id, p_limit, p_offset); $$;
create or replace function public.cancel_my_reservation(p_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.cancel_my_reservation_impl(p_id); $$;
create or replace function public.delete_my_account()
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.delete_my_account_impl(); $$;

revoke all on function private.set_favorite_impl(uuid, boolean) from public;
revoke all on function private.my_favorites_impl() from public;
revoke all on function private.my_reservations_impl(uuid, integer, integer) from public;
revoke all on function private.cancel_my_reservation_impl(uuid) from public;
revoke all on function private.delete_my_account_impl() from public;
revoke all on function public.set_favorite(uuid, boolean) from public;
revoke all on function public.my_favorites() from public;
revoke all on function public.my_reservations(uuid, integer, integer) from public;
revoke all on function public.cancel_my_reservation(uuid) from public;
revoke all on function public.delete_my_account() from public;
grant execute on function private.set_favorite_impl(uuid, boolean) to authenticated;
grant execute on function private.my_favorites_impl() to authenticated;
grant execute on function private.my_reservations_impl(uuid, integer, integer) to authenticated;
grant execute on function private.cancel_my_reservation_impl(uuid) to authenticated;
grant execute on function private.delete_my_account_impl() to authenticated;
grant execute on function public.set_favorite(uuid, boolean) to authenticated;
grant execute on function public.my_favorites() to authenticated;
grant execute on function public.my_reservations(uuid, integer, integer) to authenticated;
grant execute on function public.cancel_my_reservation(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
