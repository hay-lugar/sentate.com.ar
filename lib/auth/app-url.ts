type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Origen público de la app para los enlaces de email (alta, recuperación).
 * Sale de APP_URL (configuración del servidor). Nunca se arma con los headers `origin` o `host`
 * del request: un cliente puede falsearlos y el enlace llevaría a otro dominio.
 */
export function appOrigin(env: Env = process.env): string {
  const raw = env.APP_URL;
  if (!raw) throw new Error("Falta APP_URL (ver .env.example).");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("APP_URL no es una URL válida.");
  }

  const localHttp = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) && env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("APP_URL debe usar https (http solo en localhost, fuera de producción).");
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("APP_URL debe ser solo el origen, sin ruta ni credenciales.");
  }
  return url.origin;
}

/** Enlace de vuelta desde un email. `next` debe ser una ruta interna ya validada con safeNext. */
export function authCallbackUrl(next: string, env: Env = process.env): string {
  return `${appOrigin(env)}/auth/callback?next=${encodeURIComponent(next)}`;
}
