import { readRateLimitConfig } from "../abuse/rate-limit.ts";
import { appOrigin } from "../auth/app-url.ts";
import { isPilotOrigin } from "../qr/url.ts";

/**
 * Comprobación previa al despliegue (`npm run preflight`): mira un conjunto de variables de entorno y dice qué falta o
 * está mal para el piloto. Es PURA y NUNCA incluye un valor en sus mensajes (un reporte pegado en un chat o en un
 * ticket no puede filtrar un secreto ni una URL). Las importaciones llevan extensión `.ts` para que Node las ejecute
 * directo (type stripping), sin dependencias nuevas.
 */
export type Target = "pilot" | "preview" | "dev";
export type Finding = { id: string; level: "ok" | "error" | "warn"; message: string };

type Env = Record<string, string | undefined>;

/** Clave publicable por defecto del stack local de Supabase: es pública por diseño, pero no es la del proyecto remoto. */
export const LOCAL_PUBLISHABLE_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

/** Secretos de administración o de la CLI: no tienen que estar en el entorno de la app desplegada. */
const FORBIDDEN_IN_APP = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SERVICE_ROLE_KEY", "SUPABASE_DB_PASSWORD", "SUPABASE_ACCESS_TOKEN"];

const PILOT_HOSTS = new Set(["sentate.com.ar", "www.sentate.com.ar"]);

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Rol de un JWT (clave legada de Supabase) sin verificarlo: solo para detectar una service_role pegada por error. */
function jwtRole(key: string): string | null {
  const part = key.split(".")[1];
  if (!part || !key.startsWith("eyJ")) return null;
  try {
    const payload = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function preflight(env: Env, target: Target): Finding[] {
  const out: Finding[] = [];
  const strict = target !== "dev";
  const add = (id: string, level: Finding["level"], message: string) => out.push({ id, level, message });
  const problem = (id: string, message: string) => add(id, strict ? "error" : "warn", message);

  // ── Supabase ──
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!rawUrl) {
    add("supabase-url", "error", "Falta NEXT_PUBLIC_SUPABASE_URL.");
  } else {
    try {
      const url = new URL(rawUrl);
      const loopback = LOOPBACK.has(url.hostname);
      if (strict && (loopback || url.protocol !== "https:")) problem("supabase-url", "NEXT_PUBLIC_SUPABASE_URL apunta a un Supabase local o sin https: no sirve para un despliegue.");
      else if (strict && !url.hostname.endsWith(".supabase.co")) add("supabase-url", "warn", "NEXT_PUBLIC_SUPABASE_URL no termina en .supabase.co (¿dominio propio?). Confirmá que es el proyecto correcto.");
      else add("supabase-url", "ok", "NEXT_PUBLIC_SUPABASE_URL presente y con https.");
    } catch {
      add("supabase-url", "error", "NEXT_PUBLIC_SUPABASE_URL no es una URL válida.");
    }
  }

  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) {
    add("supabase-key", "error", "Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  } else if (key.startsWith("sb_secret_") || jwtRole(key) === "service_role") {
    add("supabase-key", "error", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY es una clave SECRETA (service_role). Va al navegador: usá la clave publicable.");
  } else if (strict && key === LOCAL_PUBLISHABLE_KEY) {
    add("supabase-key", "error", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY es la clave del Supabase LOCAL, no la del proyecto remoto.");
  } else if (!key.startsWith("sb_publishable_") && !key.startsWith("eyJ")) {
    add("supabase-key", "warn", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no tiene el formato esperado (sb_publishable_…).");
  } else {
    add("supabase-key", "ok", "Clave publicable presente.");
  }

  const forbidden = FORBIDDEN_IN_APP.filter((name) => (env[name] ?? "").trim() !== "");
  if (forbidden.length) add("forbidden-secrets", strict ? "error" : "warn", `El entorno de la app no debe tener: ${forbidden.join(", ")}. Son secretos de administración; la app usa solo la clave publicable.`);
  else add("forbidden-secrets", "ok", "Sin secretos de administración en el entorno de la app.");

  // ── Dirección pública ──
  try {
    const origin = appOrigin(env);
    if (strict && !isPilotOrigin(origin)) {
      add("app-url", "error", "APP_URL no es un origen de despliegue: tiene que ser https con un dominio real (no localhost).");
    } else if (target === "pilot" && !PILOT_HOSTS.has(new URL(origin).hostname)) {
      add("app-url", "warn", "APP_URL no es sentate.com.ar. Para el piloto se espera ese dominio.");
    } else {
      add("app-url", "ok", "APP_URL válida.");
    }
  } catch (e) {
    add("app-url", strict ? "error" : "warn", e instanceof Error ? e.message : "APP_URL inválida.");
  }

  // ── Límite por conexión ──
  const rate = readRateLimitConfig({ ...env, NODE_ENV: "production" });
  if (rate.mode === "on") add("rate-limit", "ok", "Límite por conexión configurado (header de IP y secreto).");
  else if (rate.mode === "off") problem("rate-limit", "RATE_LIMIT_MODE=off apaga el límite por conexión. Solo es válido en desarrollo.");
  else add("rate-limit", strict ? "error" : "warn", `Límite por conexión: ${rate.reason}`);

  // ── Cosas de demo y de pruebas que no tienen que llegar a un despliegue ──
  if (strict && (env.NEXT_PUBLIC_DEMO_SIMULATE ?? "").trim() !== "") add("demo-flag", "error", "NEXT_PUBLIC_DEMO_SIMULATE está definida: fuerza errores o demoras simulados en toda la app.");
  const leftovers = Object.keys(env).filter((name) => /^E2E_/.test(name) || name === "PW_CHROMIUM_PATH" || name === "NEXT_DIST_DIR");
  if (strict && leftovers.length) add("test-vars", "warn", `Hay variables de pruebas en el entorno (${leftovers.join(", ")}). No hacen falta en un despliegue.`);

  return out;
}

export const hasErrors = (findings: Finding[]) => findings.some((f) => f.level === "error");

const ICON = { ok: "✔", warn: "!", error: "✖" } as const;

export function renderReport(findings: Finding[], target: Target): string {
  const lines = [`Preflight (${target}). Solo dice qué falta: nunca imprime valores.`, ""];
  for (const f of findings) lines.push(`${ICON[f.level]} ${f.id}: ${f.message}`);
  const errors = findings.filter((f) => f.level === "error").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  lines.push("", errors ? `${errors} error(es), ${warns} aviso(s). NO desplegar hasta resolver los errores.` : `Sin errores${warns ? `, ${warns} aviso(s) para revisar` : ""}.`);
  return lines.join("\n");
}
