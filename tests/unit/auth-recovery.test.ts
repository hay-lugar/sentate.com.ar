import { describe, expect, it } from "vitest";
import { appOrigin, authCallbackUrl } from "@/lib/auth/app-url";
import { failedAuthPath, isCallbackOtpType } from "@/lib/auth/recovery";
import { passwordProblem } from "@/lib/auth/password";

describe("appOrigin: origen de los enlaces de email desde configuración", () => {
  it("acepta https y devuelve solo el origen", () => {
    expect(appOrigin({ APP_URL: "https://sentate.com.ar/", NODE_ENV: "production" })).toBe("https://sentate.com.ar");
  });

  it("acepta http solo en localhost fuera de producción", () => {
    expect(appOrigin({ APP_URL: "http://localhost:3000", NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(() => appOrigin({ APP_URL: "http://localhost:3000", NODE_ENV: "production" })).toThrow(/https/);
    expect(() => appOrigin({ APP_URL: "http://sentate.com.ar", NODE_ENV: "development" })).toThrow(/https/);
  });

  it("rechaza rutas, query, credenciales y URLs inválidas", () => {
    expect(() => appOrigin({ APP_URL: "https://sentate.com.ar/admin" })).toThrow(/solo el origen/);
    expect(() => appOrigin({ APP_URL: "https://sentate.com.ar/?x=1" })).toThrow(/solo el origen/);
    expect(() => appOrigin({ APP_URL: "https://user:pw@sentate.com.ar" })).toThrow(/solo el origen/);
    expect(() => appOrigin({ APP_URL: "no-es-url" })).toThrow(/no es una URL válida/);
    expect(() => appOrigin({})).toThrow(/Falta APP_URL/);
  });

  it("no depende de headers: el enlace sale siempre de APP_URL", () => {
    expect(authCallbackUrl("/recuperar/nueva", { APP_URL: "https://sentate.com.ar", NODE_ENV: "production" })).toBe(
      "https://sentate.com.ar/auth/callback?next=%2Frecuperar%2Fnueva",
    );
  });
});

describe("failedAuthPath: a dónde vuelve un enlace que no se pudo canjear", () => {
  it("recuperación vuelve a /recuperar con mensaje de enlace", () => {
    expect(failedAuthPath("/recuperar/nueva")).toBe("/recuperar?error=enlace");
  });
  it("cualquier otro flujo vuelve al login con el mensaje de confirmación", () => {
    expect(failedAuthPath("/registro/local")).toBe("/login?error=confirmacion");
    expect(failedAuthPath(null)).toBe("/login?error=confirmacion");
  });
});

describe("isCallbackOtpType", () => {
  it("solo acepta recovery y signup", () => {
    expect(isCallbackOtpType("recovery")).toBe(true);
    expect(isCallbackOtpType("signup")).toBe(true);
    expect(isCallbackOtpType("email_change")).toBe(false);
    expect(isCallbackOtpType("magiclink")).toBe(false);
    expect(isCallbackOtpType(null)).toBe(false);
  });
});

describe("passwordProblem: mismas reglas en alta y recuperación", () => {
  it("exige 8 caracteres", () => {
    expect(passwordProblem("1234567")).toMatch(/al menos 8/);
    expect(passwordProblem("12345678")).toBeNull();
  });
  it("exige que la confirmación coincida cuando se envía", () => {
    expect(passwordProblem("abcdefgh", "abcdefgi")).toMatch(/no coinciden/);
    expect(passwordProblem("abcdefgh", "abcdefgh")).toBeNull();
    expect(passwordProblem("abcdefgh")).toBeNull();
  });
  it("respeta el límite de 72 bytes", () => {
    expect(passwordProblem("a".repeat(72))).toBeNull();
    expect(passwordProblem("a".repeat(73))).toMatch(/demasiado larga/);
    expect(passwordProblem("ñ".repeat(37))).toMatch(/demasiado larga/);
  });
});
