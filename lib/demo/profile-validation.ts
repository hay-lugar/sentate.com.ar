// Validación pura del formulario de Ajustes.

import type { ClosureDay, Schedule, Shift, TenantProfile } from "@/lib/domain/types";
import { shiftDuration, WEEKDAY_NAMES } from "@/lib/domain/schedule";
import { isValidTimeZone, isWallTime, toMinutes } from "@/lib/time/zoned";
import { contrastRatio, isHexColor } from "@/lib/theme";

export const PROFILE_LIMITS = {
  nameMax: 60,
  textMax: 120,
  /** Turnos por día. */
  maxShifts: 3,
  shiftLabelMax: 40,
  maxClosures: 60,
  closureReasonMax: 120,
  logoMaxBytes: 200 * 1024,
} as const;

type DayKey = `day${0 | 1 | 2 | 3 | 4 | 5 | 6}`;
export type ProfileErrors = Partial<
  Record<"name" | "tagline" | "cuisine" | "address" | "phone" | "timezone" | "schedule" | "closures" | "primary" | "accent" | "logo" | DayKey, string>
>;

/** Intervalo absoluto en la semana (minutos desde el domingo 00:00). */
const weekInterval = (day: number, s: Shift) => {
  const start = day * 1440 + toMinutes(s.open);
  return [start, start + shiftDuration(s)] as const;
};

/** Superposición en la semana circular: misma regla que el trigger `tenant_shifts_no_overlap`. */
function overlapsInWeek(a: readonly [number, number], b: readonly [number, number]) {
  return [-10080, 0, 10080].some((w) => a[0] < b[1] + w && b[0] + w < a[1]);
}

/** Valida los turnos de UN día (formato, duración y superposición entre ellos). */
export function validateShifts(shifts: Shift[]): string | null {
  if (shifts.length > PROFILE_LIMITS.maxShifts) return `Máximo ${PROFILE_LIMITS.maxShifts} turnos por día.`;
  for (const s of shifts) {
    if (!s.label.trim()) return "Cada turno necesita un nombre.";
    if (s.label.trim().length > PROFILE_LIMITS.shiftLabelMax) return `Nombre de turno de hasta ${PROFILE_LIMITS.shiftLabelMax} caracteres.`;
    if (!isWallTime(s.open) || !isWallTime(s.close)) return "Usá horarios válidos (HH:MM).";
    if (s.open === s.close) return `El turno “${s.label}” abre y cierra a la misma hora.`;
    if (shiftDuration(s) > 16 * 60) return `El turno “${s.label}” dura más de 16 horas.`;
  }
  for (let i = 0; i < shifts.length; i++)
    for (let j = i + 1; j < shifts.length; j++)
      if (overlapsInWeek(weekInterval(0, shifts[i]), weekInterval(0, shifts[j])))
        return `Los turnos “${shifts[i].label}” y “${shifts[j].label}” se superponen.`;
  return null;
}

const isPlainDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

export function validateClosures(closures: ClosureDay[]): string | null {
  if (closures.length > PROFILE_LIMITS.maxClosures) return `Máximo ${PROFILE_LIMITS.maxClosures} cierres.`;
  const seen = new Set<string>();
  for (const c of closures) {
    if (!isPlainDate(c.date)) return "Hay una fecha de cierre inválida.";
    if (seen.has(c.date)) return "Hay fechas de cierre repetidas.";
    seen.add(c.date);
    if (c.reason.length > PROFILE_LIMITS.closureReasonMax) return `Motivo de hasta ${PROFILE_LIMITS.closureReasonMax} caracteres.`;
  }
  return null;
}

/** Valida la semana completa: cada día y, además, turnos de días contiguos que cruzan medianoche. */
export function validateSchedule(schedule: Schedule): ProfileErrors {
  const e: ProfileErrors = {};
  if (!Array.isArray(schedule.week) || schedule.week.length !== 7) return { schedule: "Horario inválido." };
  schedule.week.forEach((shifts, day) => {
    const err = validateShifts(shifts);
    if (err) e[`day${day}` as DayKey] = err;
  });
  if (!schedule.week.some((d) => d.length)) e.schedule = "Cargá al menos un día con turnos.";
  if (!Object.keys(e).length) {
    const all = schedule.week.flatMap((shifts, day) => shifts.map((s) => ({ day, s, iv: weekInterval(day, s) })));
    outer: for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        if (all[i].day !== all[j].day && overlapsInWeek(all[i].iv, all[j].iv)) {
          const [a, b] = [all[i], all[j]];
          e[`day${a.day}` as DayKey] =
            `El turno “${a.s.label}” del ${WEEKDAY_NAMES[a.day]} se superpone con “${b.s.label}” del ${WEEKDAY_NAMES[b.day]}.`;
          break outer;
        }
  }
  const closuresError = validateClosures(schedule.closures ?? []);
  if (closuresError) e.closures = closuresError;
  return e;
}

/** Datos del local y colores (sin horarios): lo que se valida al guardar sin tocar turnos. */
export function validateProfileInfo(p: Omit<TenantProfile, "schedule">): ProfileErrors {
  const e: ProfileErrors = {};
  const L = PROFILE_LIMITS;
  if (!p.name.trim()) e.name = "Ingresá el nombre del local.";
  else if (p.name.trim().length > L.nameMax) e.name = `Máximo ${L.nameMax} caracteres.`;
  if (p.tagline.length > L.textMax) e.tagline = `Máximo ${L.textMax} caracteres.`;
  if (p.cuisine.length > L.textMax) e.cuisine = `Máximo ${L.textMax} caracteres.`;
  if (!p.address.trim()) e.address = "Ingresá la dirección.";
  const digits = p.phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) e.phone = "Ingresá un teléfono de 8 a 15 dígitos.";
  if (!isValidTimeZone(p.timezone)) e.timezone = "Zona horaria inválida.";
  if (!isHexColor(p.theme.primary)) e.primary = "Color inválido.";
  else if (contrastRatio(p.theme.primary, p.theme.primaryForeground) < 4.5)
    e.primary = "Poco contraste con el texto del botón. Elegí un tono más oscuro o más claro.";
  if (!isHexColor(p.theme.accent)) e.accent = "Color inválido.";
  else if (contrastRatio(p.theme.accent, p.theme.accentForeground) < 4.5) e.accent = "Poco contraste con su texto.";
  return e;
}

export function validateProfile(p: TenantProfile): ProfileErrors {
  return { ...validateProfileInfo(p), ...validateSchedule(p.schedule) };
}
