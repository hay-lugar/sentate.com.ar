"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redact } from "@/lib/log/redact";
import { MAX_BATCH, MAX_PRICE } from "@/lib/admin/bulk-price";
import { createClient } from "@/utils/supabase/server";

export type BulkResult =
  | { ok: true; updated: number }
  | { ok: false; code: "invalid" | "session" | "forbidden" | "conflict" | "error"; message: string; conflictIds?: string[] };

const schema = z.object({
  tenantId: z.uuid(),
  changes: z
    .array(z.object({ id: z.uuid(), price: z.number().min(0).max(MAX_PRICE), expected: z.string().min(10).max(40) }))
    .min(1)
    .max(MAX_BATCH),
});

/** Aplica el cambio de precios de forma atómica. La autorización y el control de versión los decide la base. */
export async function bulkUpdatePricesAction(tenantId: unknown, changes: unknown): Promise<BulkResult> {
  const parsed = schema.safeParse({ tenantId, changes });
  if (!parsed.success) return { ok: false, code: "invalid", message: "Revisá los precios: hay valores fuera de rango." };
  const supabase = createClient(await cookies());
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, code: "session", message: "Tu sesión venció. Volvé a ingresar." };

  const { data, error } = await supabase.rpc("bulk_update_prices", { p_tenant_id: parsed.data.tenantId, p_changes: parsed.data.changes });
  if (error) {
    if (error.code === "42501") return { ok: false, code: "forbidden", message: "No tenés permiso o tu período de prueba terminó." };
    if (error.code === "P0001" && error.message === "price_conflict") {
      const ids = String((error as { details?: string }).details ?? "").split(",").filter(Boolean);
      return { ok: false, code: "conflict", message: "Algunos platos cambiaron mientras editabas. No se aplicó ningún cambio.", conflictIds: ids };
    }
    if (error.code === "P0001") return { ok: false, code: "invalid", message: "Algún precio o la selección no es válida." };
    console.error("[sentate] bulk prices", error.code, redact(error.message));
    return { ok: false, code: "error", message: "No se pudo aplicar. Probá de nuevo." };
  }
  revalidatePath("/admin");
  return { ok: true, updated: (data as { updated: number }).updated };
}
