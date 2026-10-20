import { describe, expect, it } from "vitest";
import { getTenantRecord } from "@/lib/data/tenants";
import { demoReducer, type DemoState } from "@/lib/demo/state";
import { validateCategoryName, validateDishForm, type DishFormValues } from "@/lib/demo/menu-validation";
import { validateProfile, validateShifts } from "@/lib/demo/profile-validation";
import { parsePrice } from "@/lib/format";

const base = (): DemoState => {
  const r = getTenantRecord("el-bodegon")!;
  return { slug: r.slug, profile: r.profile, categories: r.categories, reservations: [] };
};
const form = (over: Partial<DishFormValues> = {}): DishFormValues => ({
  name: "Milanesa",
  description: "",
  price: "12.500",
  categoryId: "parrilla",
  image: "",
  tags: [],
  active: true,
  ...over,
});

describe("parsePrice", () => {
  it.each([
    ["12500", 12500],
    ["12.500", 12500],
    ["$ 12.500", 12500],
    ["12,50", null],
    ["-5", null],
    ["abc", null],
    ["", null],
  ])("%s → %s", (input, expected) => expect(parsePrice(input)).toBe(expected));
});

describe("validateDishForm", () => {
  const cats = base().categories;
  it("acepta un plato válido y normaliza el precio", () => {
    const r = validateDishForm(form(), cats);
    expect(r.ok && r.dish.price).toBe(12500);
  });
  it("rechaza precio 0, decimales y fuera de rango", () => {
    for (const price of ["0", "12,5", "99999999"]) expect(validateDishForm(form({ price }), cats).ok).toBe(false);
  });
  it("rechaza nombre vacío, categoría inexistente e imagen no https", () => {
    const r = validateDishForm(form({ name: " ", categoryId: "nope", image: "http://x.com/a.jpg" }), cats);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["categoryId", "image", "name"]);
  });
});

describe("reducer de carta", () => {
  it("crea, edita, mueve de categoría y cambia disponibilidad", () => {
    let s = base();
    s = demoReducer(s, { type: "saveDish", categoryId: "postres", dish: { name: "Flan", description: "", price: 1, tags: [], active: true } });
    const created = s.categories.find((c) => c.id === "postres")!.dishes.at(-1)!;
    expect(created.id).toMatch(/^plato-/);

    s = demoReducer(s, { type: "saveDish", categoryId: "entradas", previousCategoryId: "postres", dish: { ...created, price: 2 } });
    expect(s.categories.find((c) => c.id === "postres")!.dishes.some((d) => d.id === created.id)).toBe(false);
    expect(s.categories.find((c) => c.id === "entradas")!.dishes.find((d) => d.id === created.id)!.price).toBe(2);

    s = demoReducer(s, { type: "toggleDish", categoryId: "entradas", dishId: created.id });
    expect(s.categories.find((c) => c.id === "entradas")!.dishes.find((d) => d.id === created.id)!.active).toBe(false);
  });

  it("reordena categorías sin salirse de los bordes", () => {
    let s = base();
    const order = () => s.categories.map((c) => c.id);
    s = demoReducer(s, { type: "moveCategory", categoryId: "entradas", direction: -1 });
    expect(order()[0]).toBe("entradas");
    s = demoReducer(s, { type: "moveCategory", categoryId: "entradas", direction: 1 });
    expect(order().slice(0, 2)).toEqual(["parrilla", "entradas"]);
  });

  it("renombra, crea y elimina categorías; ignora nombres vacíos", () => {
    let s = base();
    s = demoReducer(s, { type: "renameCategory", categoryId: "pastas", name: "  " });
    expect(s.categories.find((c) => c.id === "pastas")!.name).toBe("Pastas");
    s = demoReducer(s, { type: "addCategory", name: "Sugerencias" });
    expect(s.categories.at(-1)!.name).toBe("Sugerencias");
    s = demoReducer(s, { type: "deleteCategory", categoryId: "pastas" });
    expect(s.categories.some((c) => c.id === "pastas")).toBe(false);
  });

  it("valida nombres de categoría duplicados sin distinguir mayúsculas", () => {
    expect(validateCategoryName("entradas", base().categories)).toMatch(/existe/);
    expect(validateCategoryName("Entradas", base().categories, "entradas")).toBeNull();
  });
});

describe("Ajustes", () => {
  it("detecta turnos superpuestos, incluso cruzando medianoche", () => {
    expect(
      validateShifts([
        { id: "a", label: "Cena", open: "20:00", close: "01:00" },
        { id: "b", label: "Trasnoche", open: "00:30", close: "03:00" },
      ]),
    ).toMatch(/superponen/);
    expect(
      validateShifts([
        { id: "a", label: "Almuerzo", open: "12:00", close: "16:00" },
        { id: "b", label: "Cena", open: "20:00", close: "00:30" },
      ]),
    ).toBeNull();
  });

  it("acepta el perfil de ejemplo y rechaza colores con poco contraste", () => {
    const p = base().profile;
    expect(validateProfile(p)).toEqual({});
    expect(validateProfile({ ...p, theme: { ...p.theme, primary: "#ffdd00", primaryForeground: "#ffffff" } }).primary).toMatch(/contraste/);
  });
});
