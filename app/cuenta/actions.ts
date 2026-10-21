"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redact } from "@/lib/log/redact";
import { createClient } from "@/utils/supabase/server";

export type AccountResult = { ok: true; message?: string } | { ok: false; message: string };

const session = async () => {
  const supabase = createClient(await cookies());
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ? { supabase, uid: data.claims.sub as string } : null;
};
const SESSION_ERROR: AccountResult = { ok: false, message: "Tu sesión venció. Volvé a ingresar." };

const profile = z.object({
  displayName: z.string().trim().max(80, "Hasta 80 caracteres."),
  phone: z.string().trim().refine((v) => v === "" || /^[0-9 ()+-]{8,24}$/.test(v), "Ingresá un teléfono válido o dejalo vacío."),
});

/** Resultado del formulario de perfil: devuelve lo escrito para que React no lo borre al terminar la acción. */
export type ProfileState = (AccountResult & { fields: { displayName: string; phone: string } }) | null;

export async function saveProfileAction(_prev: ProfileState, form: FormData): Promise<NonNullable<ProfileState>> {
  const fields = { displayName: String(form.get("displayName") ?? ""), phone: String(form.get("phone") ?? "") };
  const parsed = profile.safeParse(fields);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisá los datos.", fields };
  const s = await session();
  if (!s) return { ...SESSION_ERROR, fields };
  const { error } = await s.supabase
    .from("diner_profiles")
    .upsert({ user_id: s.uid, display_name: parsed.data.displayName, phone: parsed.data.phone }, { onConflict: "user_id" });
  if (error) {
    console.error("[sentate] perfil", error.code, redact(error.message));
    return { ok: false, message: "No pudimos guardar. Probá de nuevo.", fields };
  }
  revalidatePath("/cuenta");
  return { ok: true, message: "Guardado.", fields: { displayName: parsed.data.displayName, phone: parsed.data.phone } };
}

export async function cancelReservationAction(id: unknown): Promise<AccountResult & { code?: string }> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Solicitud inválida.", code: "not_found" };
  const s = await session();
  if (!s) return SESSION_ERROR;
  const { error } = await s.supabase.rpc("cancel_my_reservation", { p_id: parsed.data });
  if (error) {
    if (error.code !== "P0001") console.error("[sentate] cancelar", error.code, redact(error.message));
    return { ok: false, message: error.message, code: error.code === "P0001" ? error.message : "error" };
  }
  revalidatePath("/cuenta/reservas");
  return { ok: true };
}

export async function setFavoriteAction(tenantId: unknown, on: unknown): Promise<AccountResult> {
  const parsed = z.object({ tenantId: z.uuid(), on: z.boolean() }).safeParse({ tenantId, on });
  if (!parsed.success) return { ok: false, message: "Solicitud inválida." };
  const s = await session();
  if (!s) return SESSION_ERROR;
  const { error } = await s.supabase.rpc("set_favorite", { p_tenant_id: parsed.data.tenantId, p_on: parsed.data.on });
  if (error) {
    if (error.message === "too_many_favorites") return { ok: false, message: "Llegaste al máximo de 100 favoritos." };
    if (error.message === "tenant_unavailable") return { ok: false, message: "Este local ya no está disponible." };
    console.error("[sentate] favorito", error.code, redact(error.message));
    return { ok: false, message: "No pudimos guardar el favorito. Probá de nuevo." };
  }
  revalidatePath("/cuenta/favoritos");
  return { ok: true };
}

/** Baja de la cuenta: borra la identidad (y favoritos/perfil). Las reservas quedan en el local, sin vínculo con la persona. */
export async function deleteAccountAction(confirmation: unknown): Promise<AccountResult> {
  if (confirmation !== "ELIMINAR") return { ok: false, message: "Escribí ELIMINAR para confirmar." };
  const s = await session();
  if (!s) return SESSION_ERROR;
  const { error } = await s.supabase.rpc("delete_my_account");
  if (error) {
    if (error.message === "account_has_responsibilities") {
      return { ok: false, message: "Tu cuenta opera un local o administra la plataforma. No se puede eliminar desde acá." };
    }
    console.error("[sentate] baja", error.code, redact(error.message));
    return { ok: false, message: "No pudimos eliminar la cuenta. Probá de nuevo." };
  }
  await s.supabase.auth.signOut().catch(() => {});
  redirect("/?cuenta=eliminada");
}
