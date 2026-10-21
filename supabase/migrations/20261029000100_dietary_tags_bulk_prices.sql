-- {Sin Nombre} · Explorador · Etapa F: etiqueta «vegano» y edición masiva de precios.
--
-- Etiquetas dietarias (vegan, veggie = vegetariano, sin-tacc = apto celíacos): las declara el local por plato; no son una
-- certificación y nunca clasifican al comercio entero.

alter table public.menu_items drop constraint menu_items_tags;
alter table public.menu_items add constraint menu_items_tags check (
  tags <@ array['popular', 'nuevo', 'vegan', 'veggie', 'picante', 'sin-tacc']::text[] and cardinality(tags) <= 6
);

-- Cambio de precios en lote, todo o nada. SECURITY INVOKER: corre con RLS del dueño (can_operate) y solo toca platos
-- de ESE comercio. Cada cambio lleva la versión (updated_at) que el panel vio: si algún plato cambió o no existe
-- (o es de otro comercio), no se aplica NADA y se informa el conflicto.
--   p_changes: [{"id": uuid, "price": number, "expected": timestamptz}, ...]  (1 a 500, sin ids repetidos)
create or replace function public.bulk_update_prices(p_tenant_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_distinct integer;
  v_conflicts uuid[];
  v_updated integer;
begin
  if not private.can_operate(p_tenant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if pg_catalog.jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_changes';
  end if;
  select count(*), count(distinct c.id) into v_total, v_distinct
  from pg_catalog.jsonb_to_recordset(p_changes) as c(id uuid, price numeric, expected timestamptz);
  if v_total not between 1 and 500 or v_total <> v_distinct then
    raise exception using errcode = 'P0001', message = 'invalid_changes';
  end if;
  if exists (select 1 from pg_catalog.jsonb_to_recordset(p_changes) as c(id uuid, price numeric, expected timestamptz)
             where c.id is null or c.price is null or c.expected is null or c.price < 0 or c.price > 10000000) then
    raise exception using errcode = 'P0001', message = 'invalid_price';
  end if;

  -- Bloquea las filas (en orden estable) para que dos cambios masivos simultáneos no se pisen.
  perform 1
  from public.menu_items m
  where m.tenant_id = p_tenant_id
    and m.id in (select c.id from pg_catalog.jsonb_to_recordset(p_changes) as c(id uuid, price numeric, expected timestamptz))
  order by m.id
  for update;

  select pg_catalog.array_agg(c.id order by c.id) into v_conflicts
  from pg_catalog.jsonb_to_recordset(p_changes) as c(id uuid, price numeric, expected timestamptz)
  left join public.menu_items m on m.id = c.id and m.tenant_id = p_tenant_id
  where m.id is null or m.updated_at <> c.expected;
  if v_conflicts is not null then
    raise exception using errcode = 'P0001', message = 'price_conflict',
      detail = pg_catalog.array_to_string(v_conflicts, ',');
  end if;

  update public.menu_items m set price = c.price
  from pg_catalog.jsonb_to_recordset(p_changes) as c(id uuid, price numeric, expected timestamptz)
  where m.id = c.id and m.tenant_id = p_tenant_id;
  get diagnostics v_updated = row_count;
  return pg_catalog.jsonb_build_object('updated', v_updated);
end;
$$;
revoke all on function public.bulk_update_prices(uuid, jsonb) from public;
grant execute on function public.bulk_update_prices(uuid, jsonb) to authenticated;
