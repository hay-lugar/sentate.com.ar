import { describe, expect, it } from "vitest";
import { directionsUrl } from "@/lib/map/directions";
import { filterCategories, normalize, SEARCH_MIN_DISHES } from "@/lib/menu/search";
import type { PublicCategory } from "@/lib/domain/types";

const dish = (id: string, name: string, description = "") => ({ id, name, description, price: 1000, image: undefined, tags: [] });
const cats: PublicCategory[] = [
  { id: "a", name: "Entradas", dishes: [dish("1", "Provoleta", "Con ají molido"), dish("2", "Empanadas de carne")] },
  { id: "b", name: "Postres", dishes: [dish("3", "Flan casero", "Con dulce de leche")] },
];

describe("búsqueda en la carta", () => {
  it("ignora mayúsculas y tildes", () => {
    expect(normalize("  Ají  ")).toBe("aji");
    expect(filterCategories(cats, "AJI").flatMap((c) => c.dishes.map((d) => d.id))).toEqual(["1"]);
  });

  it("busca en nombre y descripción, y todas las palabras deben aparecer", () => {
    expect(filterCategories(cats, "dulce leche").flatMap((c) => c.dishes.map((d) => d.id))).toEqual(["3"]);
    expect(filterCategories(cats, "flan carne")).toEqual([]);
  });

  it("quita las categorías vacías y no muta la carta", () => {
    const out = filterCategories(cats, "empanadas");
    expect(out.map((c) => c.id)).toEqual(["a"]);
    expect(cats[0].dishes).toHaveLength(2);
  });

  it("sin texto devuelve la carta tal cual", () => {
    expect(filterCategories(cats, "   ")).toBe(cats);
  });

  it("la búsqueda solo se ofrece en cartas largas", () => {
    expect(SEARCH_MIN_DISHES).toBeGreaterThanOrEqual(8);
  });
});

describe("cómo llegar", () => {
  it("usa las coordenadas confirmadas si las hay", () => {
    expect(directionsUrl({ address: "Av. Corrientes 4120", discovery: { lat: -34.6, lng: -58.4 } })).toBe("https://www.google.com/maps/search/?api=1&query=-34.6%2C-58.4");
  });
  it("si no, la dirección escrita, codificada", () => {
    expect(directionsUrl({ address: "Av. Corrientes 4120, Almagro" })).toBe("https://www.google.com/maps/search/?api=1&query=Av.%20Corrientes%204120%2C%20Almagro");
  });
});
