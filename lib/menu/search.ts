import type { PublicCategory } from "@/lib/domain/types";

/** Minúsculas y sin tildes: «Empanadas» coincide con «empanadas» y «ají» con «aji». */
export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Filtra platos por nombre o descripción (todas las palabras deben aparecer). Quita las categorías que quedan vacías. */
export function filterCategories(categories: PublicCategory[], query: string): PublicCategory[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return categories;
  return categories
    .map((c) => ({
      ...c,
      dishes: c.dishes.filter((d) => {
        const hay = normalize(`${d.name} ${d.description ?? ""}`);
        return words.every((w) => hay.includes(w));
      }),
    }))
    .filter((c) => c.dishes.length > 0);
}

/** La búsqueda aparece solo en cartas largas: en una carta corta estorba. */
export const SEARCH_MIN_DISHES = 10;
