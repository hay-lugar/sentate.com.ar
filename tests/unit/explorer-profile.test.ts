import { describe, expect, it } from "vitest";
import { explorerProfileSchema, inArgentina, toRpcPayload } from "@/lib/explorer/profile";

const valid = {
  businessType: "parrilla",
  cuisines: ["parrilla"],
  address: "Bv. Lehmann 100",
  provinceCode: "santa-fe",
  locality: "Rafaela",
  neighborhood: "",
  lat: -31.25,
  lng: -61.49,
  confirm: true,
  websiteUrl: "",
  instagramUrl: "https://www.instagram.com/local",
  facebookUrl: "",
};

describe("perfil del explorador", () => {
  it("acepta un perfil completo y arma el payload de la base", () => {
    const parsed = explorerProfileSchema.parse(valid);
    expect(toRpcPayload(parsed)).toMatchObject({ business_type: "parrilla", lat: -31.25, confirm: true, instagram_url: "https://www.instagram.com/local" });
  });
  it("rechaza coordenadas fuera de Argentina", () => {
    expect(explorerProfileSchema.safeParse({ ...valid, lat: 40.4, lng: -3.7 }).success).toBe(false);
    expect(inArgentina(-34.6, -58.4)).toBe(true);
    expect(inArgentina(Number.NaN, -58)).toBe(false);
  });
  it("valida enlaces por sitio y esquema", () => {
    expect(explorerProfileSchema.safeParse({ ...valid, instagramUrl: "http://instagram.com/x" }).success).toBe(false);
    expect(explorerProfileSchema.safeParse({ ...valid, instagramUrl: "https://evil.example/instagram.com/" }).success).toBe(false);
    expect(explorerProfileSchema.safeParse({ ...valid, facebookUrl: "javascript:alert(1)" }).success).toBe(false);
  });
  it("limita a 3 cocinas", () => {
    expect(explorerProfileSchema.safeParse({ ...valid, cuisines: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});
