-- Sentate · Fase 2 · 03: carta (categorías y platos) y horarios.

-- ───────────────────────── categories ─────────────────────────
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  name text not null,
  position integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_len check (char_length(btrim(name)) between 1 and 40),
  constraint categories_position_range check (position between 0 and 10000),
  -- Destino de la FK compuesta de menu_items: garantiza plato y categoría del mismo comercio.
  constraint categories_tenant_id_id_key unique (tenant_id, id)
);
create unique index categories_tenant_name_key on public.categories (tenant_id, lower(btrim(name)));
create index categories_tenant_position_idx on public.categories (tenant_id, position);
create trigger categories_set_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

-- ───────────────────────── menu_items ─────────────────────────
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  category_id uuid not null,
  name text not null,
  description text not null default '',
  -- Precio exacto (numeric, nunca float), no negativo.
  price numeric(12, 2) not null,
  currency char(3) not null default 'ARS',
  image_url text,
  tags text[] not null default '{}',
  is_available boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- FK compuesta: la categoría debe pertenecer al MISMO comercio.
  -- Borrar una categoría borra sus platos (el panel lo confirma); nunca toca reservas.
  constraint menu_items_category_same_tenant foreign key (tenant_id, category_id)
    references public.categories (tenant_id, id) on delete cascade,
  constraint menu_items_name_len check (char_length(btrim(name)) between 2 and 80),
  constraint menu_items_description_len check (char_length(description) <= 200),
  constraint menu_items_price_range check (price >= 0 and price <= 10000000),
  constraint menu_items_currency check (currency ~ '^[A-Z]{3}$'),
  constraint menu_items_image_url check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2048)),
  constraint menu_items_tags check (
    tags <@ array['popular', 'nuevo', 'veggie', 'picante', 'sin-tacc']::text[] and cardinality(tags) <= 5
  ),
  constraint menu_items_position_range check (position between 0 and 10000)
);
create index menu_items_tenant_category_position_idx on public.menu_items (tenant_id, category_id, position);
create index menu_items_category_idx on public.menu_items (category_id);
create trigger menu_items_set_updated_at before update on public.menu_items
  for each row execute function private.set_updated_at();

-- ───────────────────────── horarios ─────────────────────────
-- Representación: un turno por fila, por día de la semana en que ABRE (0 = domingo … 6 = sábado,
-- como extract(dow)). Si closes_at <= opens_at, el turno cruza medianoche y sus horarios
-- posteriores a 00:00 pertenecen a la FECHA DE SERVICIO del día en que abrió.
-- Horas de reloj en la zona del comercio (tenants.timezone).
create table public.tenant_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  weekday smallint not null,
  label text not null default '',
  opens_at time(0) not null,
  closes_at time(0) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_shifts_weekday check (weekday between 0 and 6),
  constraint tenant_shifts_label_len check (char_length(label) <= 40),
  constraint tenant_shifts_nonempty check (opens_at <> closes_at),
  constraint tenant_shifts_quarter_hours check (
    extract(minute from opens_at)::int % 15 = 0 and extract(minute from closes_at)::int % 15 = 0
    and extract(second from opens_at) = 0 and extract(second from closes_at) = 0
  )
);
create index tenant_shifts_tenant_weekday_idx on public.tenant_shifts (tenant_id, weekday, opens_at);
create trigger tenant_shifts_set_updated_at before update on public.tenant_shifts
  for each row execute function private.set_updated_at();

-- Duración en minutos (cruce de medianoche incluido).
create or replace function private.shift_minutes(opens_at time, closes_at time)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when closes_at > opens_at then (extract(epoch from closes_at - opens_at) / 60)::int
    else (extract(epoch from closes_at - opens_at) / 60)::int + 1440
  end;
$$;

-- Sin superposición de turnos del mismo comercio, considerando la semana circular.
create or replace function private.tenant_shifts_no_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s integer := new.weekday * 1440 + (extract(epoch from new.opens_at) / 60)::int;
  e integer := s + private.shift_minutes(new.opens_at, new.closes_at);
begin
  if private.shift_minutes(new.opens_at, new.closes_at) > 16 * 60 then
    raise exception using errcode = '23514', message = 'shift_too_long';
  end if;
  if exists (
    select 1
    from public.tenant_shifts o
    cross join lateral (
      select o.weekday * 1440 + (extract(epoch from o.opens_at) / 60)::int as os
    ) b
    cross join lateral (select b.os + private.shift_minutes(o.opens_at, o.closes_at) as oe) c
    cross join (values (-10080), (0), (10080)) w(shift)
    where o.tenant_id = new.tenant_id
      and o.id <> new.id
      and s < c.oe + w.shift
      and b.os + w.shift < e
  ) then
    raise exception using errcode = '23P01', message = 'shift_overlap';
  end if;
  return new;
end;
$$;
create trigger tenant_shifts_no_overlap before insert or update on public.tenant_shifts
  for each row execute function private.tenant_shifts_no_overlap();

-- Cierres puntuales por fecha de servicio (feriados, vacaciones).
create table public.tenant_closures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  service_date date not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint tenant_closures_reason_len check (char_length(reason) <= 120),
  constraint tenant_closures_unique unique (tenant_id, service_date)
);
