// Decide de dónde sale un comercio: Supabase (real) o fixtures (demo).
// Los slugs de demo están reservados en la base (create_tenant y tenants_validate), así que un slug
// de demo SIEMPRE es la demo: no hace falta consultar la base ni depender de que responda.

import type { PublicTenant } from "@/lib/domain/types";
import { getPublicTenant as getDemoPublicTenant, getTenantRecord as getDemoTenantRecord } from "./tenants";
import { getLivePublicTenant } from "./live/queries";
import { TemporaryDataError } from "./live/result";

export type TenantSource = "live" | "demo";

/**
 * null → no existe (404). Lanza TemporaryDataError si la base falló: el error boundary de la ruta
 * muestra "Reintentar" en lugar de un 404 engañoso o una carta vacía.
 */
export async function resolvePublicTenant(slug: string): Promise<{ tenant: PublicTenant; source: TenantSource } | null> {
  const demo = getDemoPublicTenant(slug);
  if (demo) return { tenant: demo, source: "demo" };
  const live = await getLivePublicTenant(slug);
  if (live.status === "ok") return { tenant: live.data, source: "live" };
  if (live.status === "error") throw new TemporaryDataError("carta");
  return null;
}

export const isDemoSlug = (slug: string) => !!getDemoTenantRecord(slug);
