"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redact } from "@/lib/log/redact";
import { createClient } from "@/utils/supabase/server";

export type AdminResult = { ok: true; message: string } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  forbidden: "No tenés permiso de superadministrador.",
  not_authenticated: "Tu sesión venció. Volvé a ingresar.",
  reason_required: "Escribí un motivo (entre 3 y 500 caracteres).",
  invalid_moderation_transition: "Este comercio ya no está pendiente de revisión: actualizá la página.",
  cannot_review_own_tenant: "No podés moderar un comercio que administrás.",
  invalid_action: "Acción inválida.",
  invalid_days: "La cantidad de días no es válida.",
  tenant_not_found: "El comercio no existe.",
};

async function rpc(name: string, args: Record<string, unknown>, ok: string): Promise<AdminResult> {
  const supabase = createClient(await cookies());
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, message: MESSAGES.not_authenticated };
  const { error } = await supabase.rpc(name, args);
  if (error) {
    const known = MESSAGES[error.message] ?? (error.code === "42501" ? MESSAGES.forbidden : null);
    if (!known) console.error("[sentate] superadmin", name, error.code, redact(error.message));
    return { ok: false, message: known ?? "No se pudo completar. Probá de nuevo." };
  }
  revalidatePath("/superadmin");
  return { ok: true, message: ok };
}

const id = z.uuid();
const reason = z.string().max(500);

export async function reviewAction(tenantId: unknown, decision: unknown, why: unknown): Promise<AdminResult> {
  const p = z.object({ id, decision: z.enum(["approve", "reject", "request_changes"]), why: reason }).safeParse({ id: tenantId, decision, why });
  if (!p.success) return { ok: false, message: "Solicitud inválida." };
  const done = { approve: "Comercio aprobado.", reject: "Comercio rechazado.", request_changes: "Se pidieron correcciones." }[p.data.decision];
  return rpc("admin_review_tenant", { p_tenant_id: p.data.id, p_decision: p.data.decision, p_reason: p.data.why }, done);
}

export async function suspensionAction(tenantId: unknown, suspended: unknown, why: unknown): Promise<AdminResult> {
  const p = z.object({ id, suspended: z.boolean(), why: reason }).safeParse({ id: tenantId, suspended, why });
  if (!p.success) return { ok: false, message: "Solicitud inválida." };
  return rpc("admin_set_suspension", { p_tenant_id: p.data.id, p_suspended: p.data.suspended, p_reason: p.data.why }, p.data.suspended ? "Comercio suspendido." : "Comercio reactivado.");
}

export async function subscriptionAction(tenantId: unknown, action: unknown, days: unknown, why: unknown): Promise<AdminResult> {
  const p = z
    .object({ id, action: z.enum(["extend_trial", "activate", "mark_past_due", "cancel"]), days: z.number().int().min(0).max(366), why: reason })
    .safeParse({ id: tenantId, action, days, why });
  if (!p.success) return { ok: false, message: "Solicitud inválida." };
  return rpc("admin_set_subscription", { p_tenant_id: p.data.id, p_action: p.data.action, p_days: p.data.days, p_reason: p.data.why }, "Suscripción actualizada.");
}

export async function featuredAction(tenantId: unknown, on: unknown, days: unknown, why: unknown): Promise<AdminResult> {
  const p = z.object({ id, on: z.boolean(), days: z.number().int().min(0).max(90), why: reason }).safeParse({ id: tenantId, on, days, why });
  if (!p.success) return { ok: false, message: "Solicitud inválida." };
  return p.data.on
    ? rpc("admin_set_featured", { p_tenant_id: p.data.id, p_days: p.data.days, p_reason: p.data.why }, "Comercio destacado.")
    : rpc("admin_clear_featured", { p_tenant_id: p.data.id, p_reason: p.data.why }, "Se quitó el destacado.");
}
