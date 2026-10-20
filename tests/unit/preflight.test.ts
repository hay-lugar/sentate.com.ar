import { describe, expect, it } from "vitest";
import { LOCAL_PUBLISHABLE_KEY, hasErrors, preflight, renderReport, type Finding } from "@/lib/config/preflight";

const SECRET = "s3cret-".repeat(8);
const PILOT_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_RemoteKeyForTheProject123",
  APP_URL: "https://sentate.com.ar",
  RATE_LIMIT_IP_HEADER: "x-real-ip",
  RATE_LIMIT_SECRET: SECRET,
};

const level = (findings: Finding[], id: string) => findings.find((f) => f.id === id)?.level;
const withEnv = (extra: Record<string, string | undefined>) => ({ ...PILOT_ENV, ...extra });

describe("preflight del piloto", () => {
  it("una configuración correcta no tiene errores ni avisos", () => {
    const findings = preflight(PILOT_ENV, "pilot");
    expect(hasErrors(findings)).toBe(false);
    expect(findings.filter((f) => f.level !== "ok")).toEqual([]);
  });

  it.each([
    ["falta la URL de Supabase", { NEXT_PUBLIC_SUPABASE_URL: undefined }, "supabase-url"],
    ["Supabase local en un despliegue", { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }, "supabase-url"],
    ["Supabase sin https", { NEXT_PUBLIC_SUPABASE_URL: "http://abcdefghijklmnop.supabase.co" }, "supabase-url"],
    ["URL de Supabase inválida", { NEXT_PUBLIC_SUPABASE_URL: "no-es-url" }, "supabase-url"],
    ["falta la clave publicable", { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }, "supabase-key"],
    ["clave del Supabase local", { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LOCAL_PUBLISHABLE_KEY }, "supabase-key"],
    ["clave secreta en la variable pública", { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abcdefghijk" }, "supabase-key"],
    ["falta APP_URL", { APP_URL: undefined }, "app-url"],
    ["APP_URL en localhost", { APP_URL: "http://localhost:3000" }, "app-url"],
    ["APP_URL con ruta", { APP_URL: "https://sentate.com.ar/admin" }, "app-url"],
    ["sin límite por conexión", { RATE_LIMIT_IP_HEADER: undefined, RATE_LIMIT_SECRET: undefined }, "rate-limit"],
    ["límite apagado", { RATE_LIMIT_MODE: "off" }, "rate-limit"],
    ["secreto del límite demasiado corto", { RATE_LIMIT_SECRET: "corto" }, "rate-limit"],
    ["flag de demo definida", { NEXT_PUBLIC_DEMO_SIMULATE: "error" }, "demo-flag"],
  ])("error: %s", (_name, extra, id) => {
    const findings = preflight(withEnv(extra), "pilot");
    expect(level(findings, id)).toBe("error");
    expect(hasErrors(findings)).toBe(true);
  });

  it("una service_role en JWT (clave legada) en la variable pública es un error", () => {
    const payload = Buffer.from(JSON.stringify({ role: "service_role", ref: "x" })).toString("base64url");
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.${"a".repeat(43)}`;
    expect(level(preflight(withEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt }), "pilot"), "supabase-key")).toBe("error");
  });

  it("una clave anon legada (JWT con rol anon) se acepta", () => {
    const payload = Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url");
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.${"a".repeat(43)}`;
    expect(level(preflight(withEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt }), "pilot"), "supabase-key")).toBe("ok");
  });

  it("secretos de administración en el entorno de la app son un error (y se nombran, sin valores)", () => {
    const findings = preflight(withEnv({ SUPABASE_SERVICE_ROLE_KEY: "x", SUPABASE_DB_PASSWORD: "y" }), "pilot");
    const f = findings.find((x) => x.id === "forbidden-secrets")!;
    expect(f.level).toBe("error");
    expect(f.message).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(f.message).toContain("SUPABASE_DB_PASSWORD");
  });

  it("un dominio distinto de sentate.com.ar en el piloto es solo un aviso; en preview no se avisa", () => {
    expect(level(preflight(withEnv({ APP_URL: "https://otro-dominio.com.ar" }), "pilot"), "app-url")).toBe("warn");
    expect(level(preflight(withEnv({ APP_URL: "https://sentate-git-x.vercel.app" }), "preview"), "app-url")).toBe("ok");
  });

  it("variables de pruebas en el entorno son un aviso", () => {
    expect(level(preflight(withEnv({ E2E_LIVE_PORT: "3300", PW_CHROMIUM_PATH: "/x" }), "pilot"), "test-vars")).toBe("warn");
  });

  it("en desarrollo lo que falta es aviso (no error) y un Supabase local sirve", () => {
    const findings = preflight(
      { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LOCAL_PUBLISHABLE_KEY, APP_URL: "http://localhost:3000", RATE_LIMIT_MODE: "off", SUPABASE_DB_PASSWORD: "x" },
      "dev",
    );
    expect(hasErrors(findings)).toBe(false);
    expect(level(findings, "forbidden-secrets")).toBe("warn"); // legítimo en una máquina que usa la CLI
  });
});

describe("el reporte nunca filtra valores", () => {
  it("ni la URL, ni la clave, ni el secreto, ni el dominio aparecen en el texto", () => {
    const env = withEnv({ SUPABASE_SERVICE_ROLE_KEY: "valor-ultra-secreto-1234", APP_URL: "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
    const report = renderReport(preflight(env, "pilot"), "pilot");
    for (const value of ["valor-ultra-secreto-1234", SECRET, "RemoteKeyForTheProject123", "127.0.0.1", "localhost:3000", "abcdefghijklmnop"]) {
      expect(report).not.toContain(value);
    }
  });

  it("incluso con una configuración inválida, los mensajes no citan los valores recibidos", () => {
    const report = renderReport(preflight({ NEXT_PUBLIC_SUPABASE_URL: "https://usuario:clave-secreta@evil.example", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_clave-privada-9999", APP_URL: "https://user:pw-privada@sentate.com.ar" }, "pilot"), "pilot");
    for (const value of ["clave-secreta", "clave-privada-9999", "pw-privada", "evil.example"]) expect(report).not.toContain(value);
  });

  it("el resumen cuenta errores y avisos", () => {
    const report = renderReport(preflight({}, "pilot"), "pilot");
    expect(report).toMatch(/error\(es\)/);
    expect(report).toContain("NO desplegar");
  });
});
