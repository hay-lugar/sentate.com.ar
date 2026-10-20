// Mapeo puro de filas de Supabase a los tipos de dominio que usa el frontend.
// Sin dependencias de red: testeable con vitest.

import type {
  Category,
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
};

export type ShiftRow = { weekday: number; label: string; opens_at: string; closes_at: string };
export type CategoryRow = { id: string; name: string; position: number; is_visible: boolean };
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
};
export type ReservationRow = {
  id: string;
  starts_at: string;
  service_date: string;
  guests: number;
  customer_name: string;
  customer_phone: string;
  notes: string;
  status: Reservation["status"] | "cancelled";
  created_at: string;
};

const hhmm = (t: string) => t.slice(0, 5);

/**
 * La base guarda un turno por fila y por día. El panel modela "los mismos turnos todos los días
 * abiertos": se toman los turnos del primer día abierto. Si los días difieren, se informa con
 * `uniform: false` (el editor reescribe todos los días al guardar).
 */
export function rowsToSchedule(rows: ShiftRow[]): Schedule & { uniform: boolean } {
  const openDays = [...new Set(rows.map((r) => r.weekday))].sort((a, b) => a - b);
  if (!openDays.length) return { openDays: [], shifts: [], uniform: true };
  const signature = (day: number) =>
    rows
      .filter((r) => r.weekday === day)
      .map((r) => `${hhmm(r.opens_at)}-${hhmm(r.closes_at)}`)
      .sort()
      .join(",");
  const first = signature(openDays[0]);
  const shifts = rows
    .filter((r) => r.weekday === openDays[0])
    .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
    .map((r, i) => ({ id: `turno-${i + 1}`, label: r.label || `Turno ${i + 1}`, open: hhmm(r.opens_at), close: hhmm(r.closes_at) }));
  return { openDays, shifts, uniform: openDays.every((d) => signature(d) === first) };
}

export function rowToProfile(t: TenantRow, shifts: ShiftRow[]): TenantProfile {
  const { openDays, shifts: dayShifts } = rowsToSchedule(shifts);
  const schedule = { openDays, shifts: dayShifts };
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
  };
}

export function rowsToCategories(categories: CategoryRow[], items: MenuItemRow[]): Category[] {
  return [...categories]
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id,
      name: c.name,
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
    // "cancelled" se muestra como rechazada en el panel actual (estado terminal).
    status: r.status === "cancelled" ? "rejected" : r.status,
    receivedMinutesAgo: Math.max(0, Math.floor((nowMs - new Date(r.created_at).getTime()) / 60000)),
  };
}

/** Contrato público para un comercio real (misma lista permitida que las demos + id). */
export function liveToPublicTenant(t: TenantRow, shifts: ShiftRow[], categories: CategoryRow[], items: MenuItemRow[]): PublicTenant {
  const profile = rowToProfile(t, shifts);
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
  };
}
