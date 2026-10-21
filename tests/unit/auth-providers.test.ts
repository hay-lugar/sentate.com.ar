import { describe, expect, it } from "vitest";
import { enabledProviders, fetchEnabledProviders, isOAuthProvider } from "@/lib/auth/providers";

describe("proveedores de ingreso", () => {
  it("solo muestra los habilitados por Supabase", () => {
    expect(enabledProviders({ external: { google: true, apple: false, github: true } })).toEqual(["google"]);
    expect(enabledProviders({ external: { google: true, apple: true } })).toEqual(["google", "apple"]);
  });
  it("una respuesta rara significa ninguno", () => {
    expect(enabledProviders(null)).toEqual([]);
    expect(enabledProviders({})).toEqual([]);
    expect(enabledProviders({ external: { google: "true" } })).toEqual([]);
  });
  it("valida el proveedor pedido", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("github")).toBe(false);
    expect(isOAuthProvider(undefined)).toBe(false);
  });
  it("si falla la consulta, no hay botones", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
    expect(await fetchEnabledProviders((async () => new Response("", { status: 500 })) as unknown as typeof fetch)).toEqual([]);
    expect(await fetchEnabledProviders((async () => { throw new Error("red"); }) as unknown as typeof fetch)).toEqual([]);
  });
});
