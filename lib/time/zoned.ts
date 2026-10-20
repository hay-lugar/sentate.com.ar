// Fechas y horas expresadas en la zona del comercio, independientes del TZ
// del servidor o del dispositivo. Trabajamos con fechas calendario ("YYYY-MM-DD")
// y minutos desde medianoche; nunca con Date locales.

import type { PlainDate, WallTime } from "@/lib/domain/types";

export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

export const TIMEZONE_OPTIONS = [
  { id: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { id: "America/Montevideo", label: "Uruguay (Montevideo)" },
  { id: "America/Santiago", label: "Chile (Santiago)" },
  { id: "America/Bogota", label: "Colombia (Bogotá)" },
  { id: "America/Mexico_City", label: "México (CDMX)" },
  { id: "Europe/Madrid", label: "España (Madrid)" },
] as const;

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type ZonedNow = { date: PlainDate; minutes: number; weekday: number };

/** "Ahora" en la zona del comercio. */
export function zonedNow(timeZone: string, at: Date = new Date()): ZonedNow {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return { date, minutes: Number(get("hour")) * 60 + Number(get("minute")), weekday: weekdayOf(date) };
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isWallTime = (s: string): s is WallTime => TIME_RE.test(s);

export function toMinutes(hhmm: WallTime) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(mins: number): WallTime {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/* ───────────── Aritmética de fechas calendario (vía UTC, sin TZ local) ───────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isPlainDate = (s: unknown): s is PlainDate => typeof s === "string" && DATE_RE.test(s);

/** Número de día absoluto (días desde 1970-01-01). */
export function dayNumber(date: PlainDate) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): PlainDate {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export const addDays = (date: PlainDate, days: number) => fromDayNumber(dayNumber(date) + days);
export const daysBetween = (from: PlainDate, to: PlainDate) => dayNumber(to) - dayNumber(from);
export const weekdayOf = (date: PlainDate) => new Date(dayNumber(date) * 86_400_000).getUTCDay();

/** Minutos absolutos de una hora de pared en una fecha calendario (para comparar instantes del mismo comercio). */
export const absoluteMinutes = (date: PlainDate, minutes: number) => dayNumber(date) * 1440 + minutes;

/** Formatea una fecha calendario sin que el TZ del dispositivo la corra de día. */
export function formatPlainDate(date: PlainDate, opts: Intl.DateTimeFormatOptions) {
  return new Date(dayNumber(date) * 86_400_000)
    .toLocaleDateString("es-AR", { ...opts, timeZone: "UTC" })
    .replace(/\./g, "");
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Hoy", "Mañana", "Ayer" o "Jueves 22". */
export function relativeDayLabel(date: PlainDate, today: PlainDate) {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return capitalize(formatPlainDate(date, { weekday: "long", day: "numeric" }));
}
