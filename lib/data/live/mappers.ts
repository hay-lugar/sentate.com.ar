// Mapeo puro de filas de Supabase a los tipos de dominio que usa el frontend.
// Sin dependencias de red: testeable con vitest.

import type {
  Category,
  ClosureDay,
  Dish,
  DishTag,
  PublicTenant,
  Reservation,
  Schedule,
  TenantProfile,
} from "@/lib/domain/types";
import { DISH_TAGS } from "@/lib/domain/types";
import { toPublicMenu } from "@/lib/domain/public";
import { daysBetween, type ZonedNow } from "@/lib/time/zoned";

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  cuisine: string;
  price_range: string;
  address: string;
  phone: string;
  timezone: string;
  logo_url: string | null;
  cover_url: string | null;
  primary_color: string;
  primary_fg_color: string;
  accent_color: string;
  accent_fg_color: string;
  is_published: boolean;
  updated_at: string;
  /** Enlaces opcionales del perfil (la base los restringe a https y al dominio correcto). */
  website_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
};

export type ShiftRow = { id: string; weekday: number; label: string; opens_at: string; closes_at: string };
export type ClosureRow = { service_date: string; reason: string };
export type CategoryRow = { id: string; name: string; position: number; is_visible: boolean; updated_at?: string };
export type MenuItemRow = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number | string;
  image_url: string | null;
  tags: string[];
  is_available: boolean;
  position: number;
  updated_at?: string;
};
export type ReservationRow = {
  id: string;
  starts_at: string;
  service_date: string;
  guests: number;
  customer_name: string;
  customer_phone: string;
  notes: string;
  status: Reservation["status"];
  created_at: string;
  updated_at: string;
};

const hhmm = (t: string) => t.slice(0, 5);

// Columnas que se leen (compartidas por server y cliente, p. ej. el realtime del panel).
export const TENANT_COLUMNS =
  "id, slug, name, tagline, cuisine, price_range, address, phone, timezone, logo_url, cover_url, primary_color, primary_fg_color, accent_color, accent_fg_color, is_published, updated_at, website_url, instagram_url, facebook_url";
export const SHIFT_COLUMNS = "id, weekday, label, opens_at, closes_at";
export const CLOSURE_COLUMNS = "service_date, reason";
export const CATEGORY_COLUMNS = "id, name, position, is_visible, updated_at";
export const MENU_ITEM_COLUMNS = "id, category_id, name, description, price, image_url, tags, is_available, position, updated_at";
export const RESERVATION_COLUMNS =
  "id, starts_at, service_date, guests, customer_name, customer_phone, notes, status, created_at, updated_at";

/**
 * La base guarda un turno por fila y por día de la semana en que abre. Se conserva tal cual:
 * cada día con sus propios turnos (sin colapsar días distintos) y los cierres excepcionales.
 */
export function rowsToSchedule(rows: ShiftRow[], closures: ClosureRow[] = []): Schedule {
  const week = Array.from({ length: 7 }, (_, day) =>
    rows
      .filter((r) => r.weekday === day)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
      .map((r, i) => ({ id: r.id, label: r.label || `Turno ${i + 1}`, open: hhmm(r.opens_at), close: hhmm(r.closes_at) })),
  );
  const closureDays: ClosureDay[] = [...closures]
    .sort((a, b) => a.service_date.localeCompare(b.service_date))
    .map((c) => ({ date: c.service_date, reason: c.reason ?? "" }));
  return { week, closures: closureDays };
}

export function rowToProfile(t: TenantRow, shifts: ShiftRow[], closures: ClosureRow[] = []): TenantProfile {
  const schedule = rowsToSchedule(shifts, closures);
  return {
    name: t.name,
    tagline: t.tagline,
    cuisine: t.cuisine,
    priceRange: (["$", "$$", "$$$"].includes(t.price_range) ? t.price_range : "$$") as TenantProfile["priceRange"],
    address: t.address,
    phone: t.phone,
    timezone: t.timezone,
    schedule,
    theme: {
      primary: t.primary_color,
      primaryForeground: t.primary_fg_color,
      accent: t.accent_color,
      accentForeground: t.accent_fg_color,
    },
    logoUrl: t.logo_url ?? undefined,
    coverImage: t.cover_url ?? undefined,
  };
}

const isTag = (t: string): t is DishTag => (DISH_TAGS as string[]).includes(t);

export function rowToDish(r: MenuItemRow): Dish {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    // numeric llega como string desde PostgREST; los precios del MVP son enteros.
    price: Number(r.price),
    image: r.image_url ?? undefined,
    tags: r.tags.filter(isTag),
    active: r.is_available,
    version: r.updated_at,
  };
}

export function rowsToCategories(categories: CategoryRow[], items: MenuItemRow[]): Category[] {
  return [...categories]
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id,
      name: c.name,
      version: c.updated_at,
      dishes: items
        .filter((i) => i.category_id === c.id)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
        .map(rowToDish),
    }));
}

/** Hora de reloj (HH:MM) de un instante en la zona del comercio. */
export function localTime(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(
    new Date(iso),
  );
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

export function rowToReservation(r: ReservationRow, timeZone: string, now: ZonedNow, nowMs: number): Reservation {
  return {
    id: r.id,
    name: r.customer_name,
    phone: r.customer_phone,
    guests: r.guests,
    dayOffset: daysBetween(now.date, r.service_date),
    time: localTime(r.starts_at, timeZone),
    notes: r.notes || undefined,
    status: r.status,
    receivedMinutesAgo: Math.max(0, Math.floor((nowMs - new Date(r.created_at).getTime()) / 60000)),
    version: r.updated_at,
  };
}

/** Contrato público para un comercio real (misma lista permitida que las demos + id). */
/** Solo enlaces https (defensa en profundidad: la base ya lo exige). Sin enlaces, no agrega la propiedad. */
export function publicLinks(t: Pick<TenantRow, "website_url" | "instagram_url" | "facebook_url">): { links?: NonNullable<PublicTenant["links"]> } {
  const ok = (u?: string | null) => (u && /^https:\/\/[^\s]+$/.test(u) ? u : undefined);
  const links = { website: ok(t.website_url), instagram: ok(t.instagram_url), facebook: ok(t.facebook_url) };
  return Object.values(links).some(Boolean) ? { links: Object.fromEntries(Object.entries(links).filter(([, v]) => v)) } : {};
}

export function liveToPublicTenant(
  t: TenantRow,
  shifts: ShiftRow[],
  categories: CategoryRow[],
  items: MenuItemRow[],
  closures: ClosureRow[] = [],
): PublicTenant {
  const profile = rowToProfile(t, shifts, closures);
  return {
    id: t.id,
    slug: t.slug,
    name: profile.name,
    tagline: profile.tagline,
    cuisine: profile.cuisine,
    priceRange: profile.priceRange,
    address: profile.address,
    phone: profile.phone,
    timezone: profile.timezone,
    schedule: profile.schedule,
    theme: profile.theme,
    logoUrl: profile.logoUrl,
    coverImage: profile.coverImage,
    categories: toPublicMenu(rowsToCategories(categories.filter((c) => c.is_visible), items)),
    ...publicLinks(t),
  };
}
