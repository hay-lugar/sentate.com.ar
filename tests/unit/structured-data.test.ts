import { describe, expect, it } from "vitest";
import { jsonLdString, restaurantJsonLd } from "@/lib/seo/structured-data";
import type { PublicTenant } from "@/lib/domain/types";

const base: PublicTenant = {
  slug: "bodegon", name: "El Bodegón </script>", tagline: "Parrilla", cuisine: "Parrilla", priceRange: "$$", address: "Calle 1", phone: "+54 11 0000-0000",
  timezone: "America/Argentina/Buenos_Aires",
  schedule: { week: [[], [{ id: "a", label: "Cena", open: "20:00", close: "00:30" }], [], [], [], [], []], closures: [] },
  theme: { primary: "#000000", primaryForeground: "#ffffff", accent: "#eeeeee", accentForeground: "#000000" }, categories: [],
};

describe("datos estructurados", () => {
  it("no se generan para fichas que no están listadas", () => {
    expect(restaurantJsonLd(base, "https://x.test")).toBeNull();
  });
  it("describen un restaurante listado con horarios y ubicación, sin datos privados", () => {
    const ld = restaurantJsonLd({ ...base, discovery: { lat: -31.2, lng: -61.4, locality: "Rafaela", province: "santa-fe" } }, "https://x.test")!;
    expect(ld["@type"]).toBe("Restaurant");
    expect(ld.url).toBe("https://x.test/bodegon");
    expect(JSON.stringify(ld)).toContain('"dayOfWeek":"Monday"');
    expect(JSON.stringify(ld)).not.toMatch(/reserva|email|subscription/i);
  });
  it("el JSON incrustado no puede cerrar el script", () => {
    expect(jsonLdString({ name: "</script><b>" })).not.toContain("</script>");
  });
});
