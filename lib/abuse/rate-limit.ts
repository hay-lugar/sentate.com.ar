import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type Env = Record<string, string | undefined>;

/**
 * Configuración EXPLÍCITA del límite por conexión (IP) del formulario público de reservas.
 *
 * - RATE_LIMIT_IP_HEADER: header con la IP del cliente que pone TU plataforma y un cliente no puede falsear
 *   (en Vercel, `x-real-ip` o `x-vercel-forwarded-for`; verificalo en el despliegue).
 * - RATE_LIMIT_SECRET: secreto del servidor (32+ caracteres) para firmar la IP con HMAC. La base nunca ve la IP.
 * - RATE_LIMIT_MODE=off: apagado explícito (desarrollo local, demo).
 *
 * En producción, sin nada de esto el formulario NO queda desprotegido en silencio: falla cerrado ("invalid").
 */
export type RateLimitConfig = { mode: "on"; ipHeader: string; secret: string } | { mode: "off" } | { mode: "invalid"; reason: string };

export const MIN_SECRET_LENGTH = 32;

export function readRateLimitConfig(env: Env = process.env): RateLimitConfig {
  if (env.RATE_LIMIT_MODE?.trim().toLowerCase() === "off") return { mode: "off" };

  const ipHeader = env.RATE_LIMIT_IP_HEADER?.trim().toLowerCase() ?? "";
  const secret = env.RATE_LIMIT_SECRET ?? "";

  if (ipHeader && secret) {
    if (!/^[a-z0-9-]+$/.test(ipHeader)) return { mode: "invalid", reason: "RATE_LIMIT_IP_HEADER no es un nombre de header válido." };
    if (secret.length < MIN_SECRET_LENGTH) return { mode: "invalid", reason: `RATE_LIMIT_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres.` };
    return { mode: "on", ipHeader, secret };
  }
  if (ipHeader || secret) return { mode: "invalid", reason: "RATE_LIMIT_IP_HEADER y RATE_LIMIT_SECRET se configuran juntas." };

  return env.NODE_ENV === "production"
    ? { mode: "invalid", reason: "Falta configurar RATE_LIMIT_IP_HEADER y RATE_LIMIT_SECRET (o RATE_LIMIT_MODE=off de forma explícita)." }
    : { mode: "off" };
}

/** IP del cliente desde el header configurado, o null si falta o no es una IP válida. Normaliza IPv6 y ::ffff:IPv4. */
export function clientIpFromHeader(value: string | null | undefined): string | null {
  if (!value) return null;
  let ip = value.split(",")[0].trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "").toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) ip = mapped[1];
  return isIP(ip) ? ip : null;
}

/** HMAC-SHA256 hex (64 caracteres) de la IP: lo único que viaja a la base. Sin el secreto no se puede apuntar a una IP ajena. */
export function hashClientIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`reservation-ip:${ip}`).digest("hex");
}

export type IpGate = { ok: true } | { ok: false; code: "ip_rate_limited" | "service_unavailable" | "unexpected" };

type Deps = {
  env?: Env;
  /** Lee un header de la petición (minúsculas). */
  header: (name: string) => string | null | undefined;
  /** Llama a public.consume_reservation_ip_budget con la clave ya firmada. */
  consume: (key: string) => Promise<{ data: unknown; error: { code?: string } | null }>;
  /** Registro de operación. NUNCA recibe la IP ni su hash. */
  log?: (message: string) => void;
};

/**
 * Decide si una solicitud pública puede seguir. Cierra en falla: configuración inválida, header ausente o error de la
 * base devuelven un código y no dejan pasar sin límite. Fuera de producción sin configurar, no limita (modo "off").
 */
export async function checkIpBudget({ env = process.env, header, consume, log = () => undefined }: Deps): Promise<IpGate> {
  const config = readRateLimitConfig(env);
  if (config.mode === "off") return { ok: true };
  if (config.mode === "invalid") {
    log(`[sentate] límite por conexión mal configurado: ${config.reason}`);
    return { ok: false, code: "service_unavailable" };
  }

  const ip = clientIpFromHeader(header(config.ipHeader));
  if (!ip) {
    log(`[sentate] límite por conexión: el header ${config.ipHeader} falta o no trae una IP válida`);
    return { ok: false, code: "service_unavailable" };
  }

  const { data, error } = await consume(hashClientIp(ip, config.secret));
  if (error) {
    log(`[sentate] límite por conexión: la base respondió con error ${error.code ?? "desconocido"}`);
    return { ok: false, code: "unexpected" };
  }
  return (data as { allowed?: boolean } | null)?.allowed === true ? { ok: true } : { ok: false, code: "ip_rate_limited" };
}
