-- Precio vigente del plan: $14.999 ARS por mes. Espejo server-side de lib/config/plan.ts (PLAN.priceMonthly).
-- No se edita la migración original: el valor ya aplicado se corrige con esta.
alter table private.plan_config alter column price_monthly set default 14999;
update private.plan_config set price_monthly = 14999;
