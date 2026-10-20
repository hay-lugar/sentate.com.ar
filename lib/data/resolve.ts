// Decide de dónde sale un comercio: Supabase (real) o fixtures (demo).
// Regla: si existe un comercio real publicado con ese slug, gana; si no, se usa la demo.
// Los slugs de demo están reservados en la base para que no haya colisiones en producción.

import type { PublicTenant } from "@/lib/domain/types";
import { getPublicTenant as getDemoPublicTenant, getTenantRecord as getDemoTenantRecord } from "./tenants";
import { getLivePublicTenant } from "./live/queries";

export type TenantSource = "live" | "demo";

export async function resolvePublicTenant(slug: string): Promise<{ tenant: PublicTenant; source: TenantSource } | null> {
  const live = await getLivePublicTenant(slug);
  if (live) return { tenant: live, source: "live" };
  const demo = getDemoPublicTenant(slug);
  return demo ? { tenant: demo, source: "demo" } : null;
}

export const isDemoSlug = (slug: string) => !!getDemoTenantRecord(slug);
