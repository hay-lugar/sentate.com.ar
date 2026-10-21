import { describe, expect, it } from "vitest";
import { BRAND, withBrand } from "@/lib/config/brand";
import { PLAN } from "@/lib/config/plan";

describe("marca visible temporal", () => {
  it("es el texto literal «{Sin Nombre}», con llaves", () => {
    expect(BRAND.name).toBe("{Sin Nombre}");
  });

  it("los títulos usan la marca como sufijo", () => {
    expect(withBrand("Ingresar")).toBe("Ingresar · {Sin Nombre}");
  });

  it("el plan toma el nombre de la configuración de marca, no de un literal propio", () => {
    expect(PLAN.name).toBe(BRAND.name);
  });
});
