import clsx, { type ClassValue } from "clsx";
import type { CSSProperties } from "react";
import type { Tenant, TenantTheme } from "@/data/mock";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const TIMEZONE = "America/Argentina/Buenos_Aires";

const priceFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export const formatPrice = (value: number) => priceFormatter.format(value);

export const formatNumber = (value: number) => new Intl.NumberFormat("es-AR").format(value);

/** Inyecta la paleta del tenant como CSS vars; Tailwind las consume vía `bg-brand`, etc. */
export function themeStyle(theme: TenantTheme): CSSProperties {
  return {
    "--brand": theme.primary,
    "--brand-fg": theme.primaryForeground,
    "--accent": theme.accent,
    "--accent-fg": theme.accentForeground,
  } as CSSProperties;
}

export const initials = (name: string) =>
  name
    .replace(/^(el|la|los|las)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const fromMinutes = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Hora y día de la semana actuales en Buenos Aires, sin depender del TZ del servidor/cliente. */
function nowInBA(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { minutes: Number(get("hour")) * 60 + Number(get("minute")), weekday };
}

export type OpenState = { open: boolean; label: string };

export function getOpenState(tenant: Pick<Tenant, "hours" | "closedDays">, date = new Date()): OpenState {
  const { minutes, weekday } = nowInBA(date);
  const open = toMinutes(tenant.hours.open);
  const close = toMinutes(tenant.hours.close);
  const crossesMidnight = close <= open;
  const yesterday = (weekday + 6) % 7;

  // Turno de anoche que todavía no cerró (ej: abrió ayer 18:00, cierra 03:00)
  if (crossesMidnight && minutes < close && !tenant.closedDays.includes(yesterday)) {
    return { open: true, label: `Cierra a las ${tenant.hours.close}` };
  }
  const closedToday = tenant.closedDays.includes(weekday);
  if (!closedToday && minutes >= open && (crossesMidnight || minutes < close)) {
    return { open: true, label: `Cierra a las ${tenant.hours.close}` };
  }
  if (!closedToday && minutes < open) {
    return { open: false, label: `Abre hoy a las ${tenant.hours.open}` };
  }
  return { open: false, label: `Abre a las ${tenant.hours.open}` };
}

/** Turnos de reserva cada 30' entre apertura y 1h antes del cierre. */
export function getTimeSlots(hours: Tenant["hours"]): string[] {
  const open = toMinutes(hours.open);
  let close = toMinutes(hours.close);
  if (close <= open) close += 1440;
  const slots: string[] = [];
  for (let m = Math.ceil(open / 30) * 30; m <= close - 60; m += 30) slots.push(fromMinutes(m));
  return slots;
}

/** Pseudo-random determinístico: simula disponibilidad sin backend. */
export function hashUnit(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function relativeDayLabel(dayOffset: number, base = new Date()) {
  if (dayOffset === 0) return "Hoy";
  if (dayOffset === 1) return "Mañana";
  const label = addDays(base, dayOffset).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    timeZone: TIMEZONE,
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function timeAgo(minutes: number) {
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `hace ${h} h`;
}
