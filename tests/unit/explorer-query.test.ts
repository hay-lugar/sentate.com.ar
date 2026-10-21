import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, coarsePoint, filtersFromParams, filtersToParams, toSearchBody } from "@/lib/explorer/filters";
import { applyInterpretation, interpretQuery, type Facets } from "@/lib/explorer/parse-query";

const facets: Facets = {
  localities: [
    { key: "rafaela", label: "Rafaela", province: "santa-fe" },
    { key: "san-justo-santa-fe", label: "San Justo", province: "santa-fe" },
    { key: "san-justo-buenos-aires", label: "San Justo", province: "buenos-aires" },
    { key: "palermo", label: "Palermo", province: "caba" },
  ],
  businessTypes: [
    { code: "parrilla", label: "Parrilla" },
    { code: "bar", label: "Bar" },
    { code: "pizzeria", label: "Pizzería" },
  ],
  cuisines: [
    { code: "parrilla", label: "Parrilla" },
    { code: "pizza", label: "Pizza" },
    { code: "hamburguesas", label: "Hamburguesas" },
  ],
};

describe("interpretación de la búsqueda", () => {
  it("«bar abierto ahora» → tipo + abierto ahora, sin texto libre", () => {
    const i = interpretQuery("bar abierto ahora", facets);
    expect(i.patch).toMatchObject({ businessTypes: ["bar"], openNow: true });
    expect(i.rest).toBe("");
  });
  it("«pizza cerca de mí» → cocina + cercanía (ordenada por distancia)", () => {
    const i = interpretQuery("Pizza cerca de mí", facets);
    expect(i.patch).toMatchObject({ cuisines: ["pizza"], nearby: true, sort: "distance" });
  });
  it("«hamburguesas en Palermo» → cocina + localidad", () => {
    const i = interpretQuery("hamburguesas en palermo", facets);
    expect(i.patch).toMatchObject({ cuisines: ["hamburguesas"], locality: "palermo" });
  });
  it("lo ambiguo no se aplica: parrilla es tipo y cocina; San Justo está en dos provincias", () => {
    const a = interpretQuery("parrilla en rafaela", facets);
    expect(a.patch.locality).toBe("rafaela");
    expect(a.ambiguous[0].choices.map((c) => c.kind).sort()).toEqual(["business_type", "cuisine"]);
    expect(a.patch.businessTypes).toBeUndefined();
    const b = interpretQuery("san justo", facets);
    expect(b.patch.locality).toBeUndefined();
    expect(b.ambiguous[0].choices).toHaveLength(2);
  });
  it("tolera tildes, mayúsculas y plurales; lo desconocido queda como texto libre", () => {
    const i = interpretQuery("PIZZERÍAS don pepe", facets);
    expect(i.patch.businessTypes).toEqual(["pizzeria"]);
    expect(i.rest).toBe("don pepe");
  });
  it("aplicar no duplica filtros ya activos", () => {
    const f = applyInterpretation({ ...DEFAULT_FILTERS, businessTypes: ["bar"] }, interpretQuery("bar", facets));
    expect(f.businessTypes).toEqual(["bar"]);
  });
});

describe("estado en la URL", () => {
  it("ida y vuelta, saneando valores inválidos", () => {
    const f = { ...DEFAULT_FILTERS, q: "don pepe", locality: "rafaela", cuisines: ["pizza"], price: ["$$" as const], openNow: true, view: "map" as const, page: 3 };
    expect(filtersFromParams(filtersToParams(f))).toEqual(f);
    const bad = filtersFromParams(new URLSearchParams("loc=%3Cscript%3E&tipo=a%20b,ok&pagina=-4&radio=7&orden=hack"));
    expect(bad).toMatchObject({ locality: null, businessTypes: ["ok"], page: 1, radiusKm: null, sort: "relevance" });
  });
  it("la posición nunca está en la URL", () => {
    const qs = filtersToParams({ ...DEFAULT_FILTERS, nearby: true }).toString();
    expect(qs).toBe("cerca=1");
  });
  it("la posición se redondea (~100 m) y solo se envía con «cerca de mí» o distancia", () => {
    expect(coarsePoint({ lat: -31.254321, lng: -61.491234 })).toEqual({ lat: -31.254, lng: -61.491 });
    const withPoint = toSearchBody({ ...DEFAULT_FILTERS, nearby: true, radiusKm: 5 }, { point: { lat: -31.254321, lng: -61.491234 } });
    expect(withPoint).toMatchObject({ lat: -31.254, lng: -61.491, radius_km: 5 });
    const without = toSearchBody(DEFAULT_FILTERS, { point: { lat: -31.254321, lng: -61.491234 } });
    expect(without).not.toHaveProperty("lat");
  });
  it("sin posición, «distancia» cae a nombre", () => {
    expect(toSearchBody({ ...DEFAULT_FILTERS, sort: "distance" }).sort).toBe("name");
  });
});
