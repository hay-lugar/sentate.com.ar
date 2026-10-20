import clsx, { type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

const priceFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
export const formatPrice = (value: number) => priceFormatter.format(value);
export const formatNumber = (value: number) => new Intl.NumberFormat("es-AR").format(value);

export const initials = (name: string) =>
  name
    .trim()
    .replace(/^(el|la|los|las)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

export function timeAgo(minutes: number) {
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h`;
}

/** Acepta "12500", "12.500" o "$ 12.500". Devuelve null si no es un entero positivo válido. */
export function parsePrice(input: string): number | null {
  const clean = input.replace(/[$\s.]/g, "");
  if (!/^\d+$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isSafeInteger(n) ? n : null;
}

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "item";
