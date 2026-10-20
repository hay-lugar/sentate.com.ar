// Consultas de datos. Hoy leen fixtures; en Fase 2 se reemplazan por Supabase
// sin tocar páginas ni componentes. Usar solo desde Server Components.

import { TENANT_FIXTURES } from "@/data/fixtures";
import { toPublicTenant, toTenantSummary } from "@/lib/domain/public";
import type { PublicTenant, TenantRecord, TenantSummary } from "@/lib/domain/types";

const clone = <T,>(v: T): T => structuredClone(v);

/** Registro privado completo (panel). Devuelve una copia: nadie muta los fixtures. */
export function getTenantRecord(slug: string): TenantRecord | undefined {
  const t = TENANT_FIXTURES.find((x) => x.slug === slug);
  return t && clone(t);
}

export function getPublicTenant(slug: string): PublicTenant | undefined {
  const t = TENANT_FIXTURES.find((x) => x.slug === slug);
  return t && toPublicTenant(t.slug, t.profile, t.categories);
}

export function listTenantSummaries(): TenantSummary[] {
  return TENANT_FIXTURES.map((t) => toTenantSummary(t.slug, t.profile));
}

export function listTenantSlugs(): string[] {
  return TENANT_FIXTURES.map((t) => t.slug);
}
