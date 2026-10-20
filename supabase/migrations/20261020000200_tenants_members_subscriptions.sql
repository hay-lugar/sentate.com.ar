-- Sentate · Fase 2 · 02: comercios, membresías, suscripciones y configuración.

create type public.tenant_status as enum ('active', 'suspended');
create type public.tenant_role as enum ('owner');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');

-- ───────────────────────── tenants ─────────────────────────
-- Solo datos públicos del comercio + flags de publicación/estado.
-- Lo privado (membresías, suscripción) vive en otras tablas: RLS filtra filas, no columnas.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  tagline text not null default '',
  cuisine text not null default '',
  price_range text not null default '$$',
  address text not null default '',
  phone text not null default '',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  logo_url text,
  cover_url text,
  primary_color text not null default '#c2410c',
  primary_fg_color text not null default '#ffffff',
  accent_color text not null default '#ffe9dc',
  accent_fg_color text not null default '#8a2c06',
  -- El dueño decide publicar; `status` lo controla la plataforma (no editable por el dueño).
  is_published boolean not null default false,
  status public.tenant_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tenants_slug_unique unique (slug),
  -- Slug normalizado: minúsculas, dígitos y guiones; 3–48 caracteres; sin guiones en los extremos.
  constraint tenants_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$' and slug !~ '--'),
  constraint tenants_slug_not_reserved check (
    slug not in ('admin', 'api', 'app', 'auth', 'login', 'logout', 'signup', 'registro', 'precio',
                 'precios', 'demo', 'static', 'assets', 'public', 'www', 'sentate', 'soporte', 'ayuda')
  ),
  constraint tenants_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint tenants_tagline_len check (char_length(tagline) <= 120),
  constraint tenants_cuisine_len check (char_length(cuisine) <= 120),
  constraint tenants_address_len check (char_length(address) <= 160),
  constraint tenants_phone_format check (phone = '' or phone ~ '^[0-9 ()+-]{8,24}$'),
  constraint tenants_price_range check (price_range in ('$', '$$', '$$$')),
  constraint tenants_colors check (
    primary_color ~ '^#[0-9a-f]{6}$' and primary_fg_color ~ '^#[0-9a-f]{6}$'
    and accent_color ~ '^#[0-9a-f]{6}$' and accent_fg_color ~ '^#[0-9a-f]{6}$'
  ),
  constraint tenants_logo_url check (logo_url is null or (logo_url ~ '^https://' and char_length(logo_url) <= 2048)),
  constraint tenants_cover_url check (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 2048))
);
comment on table public.tenants is 'Comercio. Solo columnas aptas para el público; la identidad es `id`, no `slug`.';
comment on column public.tenants.status is 'Estado operativo controlado por la plataforma (moderación). El dueño no puede cambiarlo.';

create trigger tenants_set_updated_at before update on public.tenants
  for each row execute function private.set_updated_at();

-- La zona horaria debe existir en el catálogo (no puede ser CHECK porque el catálogo no es inmutable).
create or replace function private.tenants_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_valid_timezone(new.timezone) then
    raise exception using errcode = '22023', message = 'invalid_timezone', detail = new.timezone;
  end if;
  new.slug := pg_catalog.lower(pg_catalog.btrim(new.slug));
  new.name := pg_catalog.btrim(new.name);
  return new;
end;
$$;
create trigger tenants_validate before insert or update on public.tenants
  for each row execute function private.tenants_validate();

-- ───────────────────────── tenant_members ─────────────────────────
create table public.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  -- Si se borra el usuario de Auth, se borra su membresía; el comercio y sus reservas quedan.
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.tenant_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
comment on table public.tenant_members is 'Quién opera cada comercio. Solo se escribe desde funciones confiables (alta del comercio).';
-- Políticas filtran por user_id; la PK cubre tenant_id primero.
create index tenant_members_user_id_idx on public.tenant_members (user_id);

-- ───────────────────────── tenant_subscriptions ─────────────────────────
-- Estado comercial. Ningún rol de cliente puede escribirla: solo funciones confiables / service_role.
create table public.tenant_subscriptions (
  tenant_id uuid primary key references public.tenants (id) on delete restrict,
  status public.subscription_status not null default 'trialing',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null,
  -- Fin del período pago vigente (Fase de pagos). Null mientras no haya suscripción paga.
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_subscriptions_trial_order check (trial_ends_at > trial_started_at),
  constraint tenant_subscriptions_active_period check (status <> 'active' or current_period_ends_at is not null)
);
comment on table public.tenant_subscriptions is
  'Prueba y suscripción. El estado almacenado puede quedar desactualizado: el acceso se calcula al operar (private.tenant_has_operational_access).';

create trigger tenant_subscriptions_set_updated_at before update on public.tenant_subscriptions
  for each row execute function private.set_updated_at();

-- ───────────────────────── configuración de producto ─────────────────────────
-- Decisión de producto PENDIENTE y explícita (ver docs/fase-2-modelo-de-datos.md §Decisión pendiente):
-- qué pasa con la carta pública cuando el comercio pierde el acceso operativo.
create table private.settings (
  id boolean primary key default true check (id),
  public_menu_when_access_lapsed text not null default 'visible'
    check (public_menu_when_access_lapsed in ('visible', 'hidden')),
  updated_at timestamptz not null default now()
);
insert into private.settings default values;
comment on column private.settings.public_menu_when_access_lapsed is
  'visible: la carta sigue publicada al vencer la prueba (las reservas igual se bloquean). hidden: se oculta. DECISIÓN PENDIENTE.';

-- Parámetros del plan (fuente de verdad del server; el front tiene su espejo en lib/config/plan.ts).
create table private.plan_config (
  id boolean primary key default true check (id),
  trial_days integer not null default 30 check (trial_days between 1 and 365),
  price_monthly numeric(12, 2) not null default 5500 check (price_monthly >= 0),
  currency char(3) not null default 'ARS' check (currency ~ '^[A-Z]{3}$')
);
insert into private.plan_config default values;
