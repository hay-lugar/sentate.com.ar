"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { explorerProfileSchema, MISSING_LABELS, toRpcPayload } from "@/lib/explorer/profile";
import { redact } from "@/lib/log/redact";
import { createClient } from "@/utils/supabase/server";

export type ExplorerResult =
  | { ok: true; missing: string[] }
  | { ok: false; code: "invalid" | "forbidden" | "session" | "error"; message: string; fieldErrors?: Record<string, string> };

type PgError = { code?: string; message?: string; details?: string } | null;

const fail = (code: "invalid" | "forbidden" | "session" | "error", message: string): ExplorerResult => ({ ok: false, code, message });

function describe(error: PgError): ExplorerResult {
  switch (error?.code) {
    case "42501":
      return fail("forbidden", "No tenés permiso para este cambio o tu período de prueba terminó.");
    case "PGRST301":
    case "PGRST303":
      return fail("session", "Tu sesión venció. Volvé a ingresar para guardar.");
    case "23514":
      return fail("invalid", "Algún enlace o dato no es válido. Revisá el formulario.");
    case "P0001":
      switch (error.message) {
        case "invalid_coordinates":
          return fail("invalid", "La ubicación debe estar en Argentina.");
        case "profile_incomplete": {
          const missing = (error.details ?? "").split(",").map((k) => MISSING_LABELS[k]).filter(Boolean);
          return fail("invalid", missing.length ? `Falta: ${missing.join(", ")}.` : "Falta completar el perfil.");
        }
        case "invalid_moderation_transition":
          return fail("invalid", "Tu comercio ya está en revisión o aprobado.");
        default:
          return fail("invalid", "Algún dato no es válido. Revisá el formulario.");
      }
    default:
      console.error("[sentate] explorer", error?.code, redact(error?.message));
      return fail("error", "No se pudo guardar. Probá de nuevo.");
  }
}

async function session() {
  const supabase = createClient(await cookies());
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ? supabase : null;
}

/** Guarda tipo, cocinas, enlaces, dirección y pin. La autorización la decide la base (can_operate). */
export async function saveExplorerProfileAction(tenantId: unknown, input: unknown): Promise<ExplorerResult> {
  const id = z.uuid().safeParse(tenantId);
  const parsed = explorerProfileSchema.safeParse(input);
  if (!id.success) return fail("invalid", "Solicitud inválida. Actualizá la página.");
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, code: "invalid", message: "Revisá los campos marcados.", fieldErrors };
  }
  const supabase = await session();
  if (!supabase) return fail("session", "Tu sesión venció. Volvé a ingresar para guardar.");
  const { data, error } = await supabase.rpc("save_explorer_profile", { p_tenant_id: id.data, p_profile: toRpcPayload(parsed.data) });
  if (error) return describe(error);
  const missing = (data as { missing?: string[] } | null)?.missing ?? [];
  return { ok: true, missing };
}

export async function submitForReviewAction(tenantId: unknown): Promise<ExplorerResult> {
  const id = z.uuid().safeParse(tenantId);
  if (!id.success) return fail("invalid", "Solicitud inválida. Actualizá la página.");
  const supabase = await session();
  if (!supabase) return fail("session", "Tu sesión venció. Volvé a ingresar.");
  const { error } = await supabase.rpc("submit_for_review", { p_tenant_id: id.data });
  if (error) return describe(error);
  return { ok: true, missing: [] };
}
