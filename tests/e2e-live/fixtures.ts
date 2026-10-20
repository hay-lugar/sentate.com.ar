import { test as base, expect, type Browser, type BrowserContextOptions } from "@playwright/test";

/**
 * Simula la IP del cliente para el límite por conexión de las reservas. El servidor de esta suite lee la IP del header
 * `x-test-client-ip` (RATE_LIMIT_IP_HEADER, ver playwright.live.config.ts), como en producción lo haría con el header
 * de su plataforma.
 *
 * El header se agrega SOLO a las peticiones al origen de la app. Con `extraHTTPHeaders` también viajaría a Supabase
 * (otro origen), y el preflight de CORS rompería las subidas a Storage y el realtime.
 */
export const CLIENT_IP_HEADER = "x-test-client-ip";
export const DEFAULT_CLIENT_IP = "203.0.113.10";

type Route = Parameters<Parameters<import("@playwright/test").BrowserContext["route"]>[1]>[0];
const withClientIp = (ip: string) => (route: Route) => route.continue({ headers: { ...route.request().headers(), [CLIENT_IP_HEADER]: ip } });

export const test = base.extend<{ clientIp: string }>({
  clientIp: [DEFAULT_CLIENT_IP, { option: true }],
  context: async ({ context, clientIp, baseURL }, provide) => {
    await context.route(`${new URL(baseURL!).origin}/**`, withClientIp(clientIp));
    await provide(context);
  },
});

/** Contexto nuevo con una IP de cliente propia (o ninguna, para probar el header ausente). */
export async function newContextWithIp(browser: Browser, baseURL: string, ip: string | null, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ baseURL, ...options });
  if (ip) await context.route(`${new URL(baseURL).origin}/**`, withClientIp(ip));
  return context;
}

export { expect };
