"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/env";
import { safeNext } from "@/lib/auth/redirects";

export type FormState = { error?: string; info?: string; fields?: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authMessage(message: string | undefined) {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Tenés que confirmar tu email antes de ingresar. Revisá tu bandeja.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Ya existe una cuenta con ese email. Ingresá.";
  if (m.includes("password")) return "La contraseña no cumple los requisitos (mínimo 8 caracteres).";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Esperá unos minutos.";
  return "No pudimos completar la operación. Probá de nuevo.";
}

async function supabase() {
  return createClient(await cookies());
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
  redirect(next ?? "/admin");
}

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { error: "La autenticación no está configurada." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email)) return { error: "Ingresá un email válido.", fields: { email } };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres.", fields: { email } };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const client = await supabase();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/registro/local` },
  });
  if (error) return { error: authMessage(error.message), fields: { email } };
  // Con confirmación de email activada no hay sesión todavía.
  if (!data.session) {
    return { info: `Te enviamos un email a ${email}. Abrí el enlace para confirmar tu cuenta y seguir con el alta de tu local.` };
  }
  redirect("/registro/local");
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
