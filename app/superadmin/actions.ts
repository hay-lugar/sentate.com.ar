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
  invalid_slug: "La dirección web no es válida (minúsculas, números y guiones, de 3 a 48 caracteres).",
  invalid_name: "El nombre debe tener entre 1 y 60 caracteres.",
  slug_taken: "Esa dirección web ya está en uso.",
  slug_mismatch: "La dirección escrita no coincide con la del comercio.",
  user_not_found: "No hay una cuenta confirmada con ese email. La persona tiene que registrarse primero.",
  cannot_remove_self: "No podés quitarte a vos mismo como administrador.",
  last_admin: "Tiene que quedar al menos un administrador.",
  admin_not_found: "Esa persona no es administradora.",
  invalid_setting: "Ajuste inválido.",
  invalid_promotion: "La promoción necesita un título de 3 a 60 caracteres y un detalle de hasta 240.",
};

async function rpc(name: string, args: Record<string, unknown>, ok: string, extra?: (data: unknown) => Partial<{ redirectTo: string }>): Promise<AdminResult & { redirectTo?: string }> {
  const supabase = createClient(await cookies());
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, message: MESSAGES.not_authenticated };
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const known = MESSAGES[error.message] ?? (error.code === "42501" ? MESSAGES.forbidden : null);
    if (!known) console.error("[sentate] superadmin", name, error.code, redact(error.message));
    return { ok: false, message: known ?? "No se pudo completar. Probá de nuevo." };
  }
  revalidatePath("/superadmin", "layout");
  return { ok: true, message: ok, ...(extra ? extra(data) : {}) };
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

export async function createTenantAction(slug: unknown, name: unknown, ownerEmail: unknown, why: unknown): Promise<AdminResult & { redirectTo?: string }> {
  const p = z.object({ slug: z.string().max(60), name: z.string().max(80), email: z.string().max(120), why: reason }).safeParse({ slug, name, email: ownerEmail, why });
  if (!p.success) return { ok: false, message: "Solicitud inválida." };
  return rpc(
    "admin_create_tenant",
    { p_slug: p.data.slug, p_name: p.data.name, p_owner_email: p.data.email || null, p_reason: p.data.why },
    "Comercio creado.",
    (d) => ({ redirectTo: `/superadmin/${(d as { tenant_id: string }).tenant_id}` }),
  );
}

export async function deleteTenantAction(tenantId: unknown, confirmSlug: unknown, why: unknown): Promise<AdminResult & { redirectTo?: string }> {
  const p = z.object({ id, slug: z.string().max(60), why: reason }).safeParse({ id: tenantId, slug: confirmSlug, why });
  if (!p.success) return { ok: false, message: "Solicitud inválida." };
  return rpc("admin_delete_tenant", { p_tenant_id: p.data.id, p_confirm_slug: p.data.slug, p_reason: p.data.why }, "Comercio eliminado.", () => ({ redirectTo: "/superadmin/comercios" }));
}

export async function promotionAction(tenantId: unknown, on: unknown, title: unknown, detail: unknown, days: unknown, why: unknown): Promise<AdminResult> {
  const p = z
    .object({ id, on: z.boolean(), title: z.string().max(80), detail: z.string().max(300), days: z.number().int().min(0).max(90), why: reason })
    .safeParse({ id: tenantId, on, title, detail, days, why });
  if (!p.success) return { ok: false, message: "Solicitud inválida." };
  return p.data.on
    ? rpc("admin_set_promotion", { p_tenant_id: p.data.id, p_title: p.data.title, p_detail: p.data.detail, p_days: p.data.days, p_reason: p.data.why }, "Promoción publicada.")
    : rpc("admin_clear_promotion", { p_tenant_id: p.data.id, p_reason: p.data.why }, "Se quitó la promoción.");
}

export async function addAdminAction(email: unknown, why: unknown): Promise<AdminResult> {
  const p = z.object({ email: z.string().max(120), why: reason }).safeParse({ email, why });
  if (!p.success) return { ok: false, message: "Solicitud inválida." };
  return rpc("admin_add_admin", { p_email: p.data.email, p_reason: p.data.why }, "Administrador agregado.");
}

export async function removeAdminAction(userId: unknown, why: unknown): Promise<AdminResult> {
  const p = z.object({ id, why: reason }).safeParse({ id: userId, why });
  if (!p.success) return { ok: false, message: "Solicitud inválida." };
  return rpc("admin_remove_admin", { p_user_id: p.data.id, p_reason: p.data.why }, "Administrador quitado.");
}

export async function platformSettingAction(value: unknown, why: unknown): Promise<AdminResult> {
  const p = z.object({ value: z.enum(["visible", "hidden"]), why: reason }).safeParse({ value, why });
  if (!p.success) return { ok: false, message: "Solicitud inválida." };
  return rpc("admin_set_platform_setting", { p_key: "public_menu_when_access_lapsed", p_value: p.data.value, p_reason: p.data.why }, "Ajuste guardado.");
}
