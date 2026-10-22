"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/env";
import { parseIntent, postLoginPath, postSignupPath } from "@/lib/auth/destinations";
import { safeNext } from "@/lib/auth/redirects";
import { authCallbackUrl } from "@/lib/auth/app-url";
import { RECOVERY_NEUTRAL_MESSAGE, RECOVERY_NEW_PASSWORD_PATH, RECOVERY_PATH } from "@/lib/auth/recovery";
import { passwordProblem } from "@/lib/auth/password";
import { fetchEnabledProviders, isOAuthProvider } from "@/lib/auth/providers";

export type FormState = { error?: string; info?: string; fields?: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authMessage(message: string | undefined) {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Tenés que confirmar tu email antes de ingresar. Revisá tu bandeja.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Ya existe una cuenta con ese email. Ingresá.";
  if (m.includes("same_password") || m.includes("different from the old")) return "La contraseña nueva tiene que ser distinta de la anterior.";
  if (m.includes("password")) return "La contraseña no cumple los requisitos (mínimo 8 caracteres).";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Esperá unos minutos.";
  return "No pudimos completar la operación. Probá de nuevo.";
}

async function supabase() {
  return createClient(await cookies());
}

/** ¿La persona administra algún local? (RLS: solo ve sus propias membresías). */
async function hasTenants(client: Awaited<ReturnType<typeof supabase>>): Promise<boolean> {
  const { count } = await client.from("tenant_members").select("tenant_id", { count: "exact", head: true });
  return (count ?? 0) > 0;
}

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { error: "La autenticación no está configurada." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  if (!EMAIL_RE.test(email) || !password) return { error: "Completá email y contraseña.", fields: { email } };

  const client = await supabase();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { error: authMessage(error.message), fields: { email } };
  redirect(postLoginPath({ next, hasTenants: await hasTenants(client) }));
}

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { error: "La autenticación no está configurada." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email)) return { error: "Ingresá un email válido.", fields: { email } };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, fields: { email } };
  const intent = parseIntent(form.get("intencion"));

  let emailRedirectTo: string;
  try {
    emailRedirectTo = authCallbackUrl(postSignupPath(intent));
  } catch {
    return { error: "La aplicación no está configurada para enviar emails. Avisale al equipo." };
  }
  const client = await supabase();
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo } });
  if (error) return { error: authMessage(error.message), fields: { email } };
  // Con confirmación de email activada no hay sesión todavía.
  if (!data.session) {
    return {
      info: `Te enviamos un email a ${email}. Abrí el enlace para confirmar tu cuenta${intent === "local" ? " y seguir con el alta de tu local" : ""}.`,
    };
  }
  redirect(postSignupPath(intent));
}

/**
 * Pide el email de recuperación. La respuesta es la misma exista o no la cuenta.
 * Solo se distingue el formato del email (dato que el usuario ya conoce) y la limitación de envíos.
 */
export async function requestPasswordResetAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { error: "La autenticación no está configurada." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Ingresá un email válido.", fields: { email } };

  let redirectTo: string;
  try {
    redirectTo = authCallbackUrl(RECOVERY_NEW_PASSWORD_PATH);
  } catch {
    return { error: "No pudimos enviar el enlace. Probá más tarde.", fields: { email } };
  }

  const client = await supabase();
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error && (error.message.toLowerCase().includes("rate limit") || error.message.toLowerCase().includes("too many"))) {
    return { error: "Ya pediste un enlace hace poco. Esperá unos minutos antes de pedir otro.", fields: { email } };
  }
  // Otros errores también reciben la respuesta neutral: no deben revelar si la cuenta existe.
  return { info: RECOVERY_NEUTRAL_MESSAGE, fields: { email } };
}

/** Fija la contraseña nueva. Requiere la sesión que dejó el enlace de recuperación ya canjeado. */
export async function setNewPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { error: "La autenticación no está configurada." };
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const problem = passwordProblem(password, confirm);
  if (problem) return { error: problem };

  const client = await supabase();
  // getUser verifica la sesión contra el servidor de Auth (getClaims solo valida el JWT localmente).
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) redirect(`${RECOVERY_PATH}?error=enlace`);

  const { error } = await client.auth.updateUser({ password });
  if (error) return { error: authMessage(error.message) };
  redirect(postLoginPath({ hasTenants: await hasTenants(client) }));
}

export async function createLocalAction(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const fields = { name, slug };
  if (!name) return { error: "Ingresá el nombre del local.", fields };

  const client = await supabase();
  const { data: claims } = await client.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=/registro/local");

  // El dueño, la prueba de 30 días y la membresía los define la base (create_tenant).
  const { data, error } = await client.rpc("create_tenant", { p_slug: slug, p_name: name });
  if (error) {
    const code = error.code === "P0001" ? error.message : "";
    const messages: Record<string, string> = {
      slug_taken: "Esa dirección ya está en uso. Probá con otra.",
      invalid_slug: "La dirección solo puede tener minúsculas, números y guiones (3 a 48 caracteres).",
      invalid_name: "Revisá el nombre del local (hasta 60 caracteres).",
      not_authenticated: "Tu sesión venció. Volvé a ingresar.",
    };
    return { error: messages[code] ?? "No pudimos crear el local. Probá de nuevo.", fields };
  }
  redirect(`/admin/${(data as { slug: string }).slug}`);
}

export async function signOutAction() {
  const client = await supabase();
  await client.auth.signOut();
  redirect("/login");
}

/**
 * Ingreso con Google/Apple. Solo si el proveedor está habilitado en Supabase. La vuelta pasa por /auth/callback con un
 * `next` interno validado; Supabase vincula identidades únicamente por email VERIFICADO por el proveedor (nunca por un
 * email que mande el cliente) y esta app no vincula cuentas por su cuenta.
 */
export async function signInWithOAuthAction(form: FormData): Promise<void> {
  const provider = form.get("provider");
  const next = safeNext(form.get("next")) ?? "/cuenta";
  if (!isSupabaseConfigured() || !isOAuthProvider(provider) || !(await fetchEnabledProviders()).includes(provider)) {
    redirect(`/login?error=proveedor&next=${encodeURIComponent(next)}`);
  }
  let redirectTo: string;
  try {
    redirectTo = authCallbackUrl(next);
  } catch {
    redirect(`/login?error=proveedor&next=${encodeURIComponent(next)}`);
  }
  const client = await supabase();
  const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) redirect(`/login?error=proveedor&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}
