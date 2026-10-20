// Validación pura de formularios del gestor de carta.

import type { Category, DishTag } from "@/lib/domain/types";
import type { DishInput } from "./state";
import { parsePrice } from "@/lib/format";

export const MENU_LIMITS = {
  dishNameMin: 2,
  dishNameMax: 80,
  descriptionMax: 200,
  priceMin: 1,
  priceMax: 10_000_000,
  categoryNameMax: 40,
} as const;

export type DishFormValues = {
  id?: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  image: string;
  tags: DishTag[];
  active: boolean;
};

export type DishFormErrors = Partial<Record<"name" | "description" | "price" | "categoryId" | "image", string>>;

const M = MENU_LIMITS;

export function validateDishForm(
  v: DishFormValues,
  categories: Pick<Category, "id">[],
): { ok: true; dish: DishInput } | { ok: false; errors: DishFormErrors } {
  const errors: DishFormErrors = {};
  const name = v.name.trim();
  if (name.length < M.dishNameMin) errors.name = "Ingresá el nombre del plato.";
  else if (name.length > M.dishNameMax) errors.name = `Máximo ${M.dishNameMax} caracteres.`;

  const description = v.description.trim();
  if (description.length > M.descriptionMax) errors.description = `Máximo ${M.descriptionMax} caracteres.`;

  const price = parsePrice(v.price);
  if (price === null) errors.price = "Ingresá un precio en pesos, sin centavos (ej: 12500).";
  else if (price < M.priceMin || price > M.priceMax) errors.price = `El precio debe estar entre $${M.priceMin} y $10.000.000.`;

  if (!categories.some((c) => c.id === v.categoryId)) errors.categoryId = "Elegí una categoría.";

  const image = v.image.trim();
  if (image) {
    try {
      const url = new URL(image);
      if (url.protocol !== "https:") errors.image = "La imagen debe ser una URL https.";
    } catch {
      errors.image = "Ingresá una URL válida o dejalo vacío.";
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    dish: { id: v.id, name, description, price: price!, image: image || undefined, tags: v.tags, active: v.active },
  };
}

export function validateCategoryName(name: string, categories: Pick<Category, "id" | "name">[], selfId?: string): string | null {
  const clean = name.trim();
  if (!clean) return "Ingresá un nombre.";
  if (clean.length > M.categoryNameMax) return `Máximo ${M.categoryNameMax} caracteres.`;
  if (categories.some((c) => c.id !== selfId && c.name.trim().toLowerCase() === clean.toLowerCase()))
    return "Ya existe una categoría con ese nombre.";
  return null;
}
