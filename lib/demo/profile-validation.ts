// Validación pura del formulario de Ajustes.

import type { Shift, TenantProfile } from "@/lib/domain/types";
import { shiftDuration } from "@/lib/domain/schedule";
import { isValidTimeZone, isWallTime, toMinutes } from "@/lib/time/zoned";
import { contrastRatio, isHexColor } from "@/lib/theme";

export const PROFILE_LIMITS = { nameMax: 60, textMax: 120, maxShifts: 3, logoMaxBytes: 200 * 1024 } as const;

export type ProfileErrors = Partial<Record<"name" | "tagline" | "cuisine" | "address" | "phone" | "timezone" | "openDays" | "shifts" | "primary" | "accent" | "logo", string>>;

function overlaps(a: Shift, b: Shift) {
  const iv = (s: Shift) => [toMinutes(s.open), toMinutes(s.open) + shiftDuration(s)] as const;
  const [a0, a1] = iv(a);
  const [b0, b1] = iv(b);
  // Compara también desplazado un día para turnos que cruzan medianoche.
  return [-1440, 0, 1440].some((d) => a0 < b1 + d && b0 + d < a1);
}

export function validateShifts(shifts: Shift[]): string | null {
  if (shifts.length === 0) return "Agregá al menos un turno.";
  if (shifts.length > PROFILE_LIMITS.maxShifts) return `Máximo ${PROFILE_LIMITS.maxShifts} turnos.`;
  for (const s of shifts) {
    if (!s.label.trim()) return "Cada turno necesita un nombre.";
    if (!isWallTime(s.open) || !isWallTime(s.close)) return "Usá horarios válidos (HH:MM).";
    if (s.open === s.close) return `El turno “${s.label}” abre y cierra a la misma hora.`;
    if (shiftDuration(s) > 16 * 60) return `El turno “${s.label}” dura más de 16 horas.`;
  }
  for (let i = 0; i < shifts.length; i++)
    for (let j = i + 1; j < shifts.length; j++)
      if (overlaps(shifts[i], shifts[j])) return `Los turnos “${shifts[i].label}” y “${shifts[j].label}” se superponen.`;
  return null;
}

export function validateProfile(p: TenantProfile): ProfileErrors {
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
  if (p.schedule.openDays.length === 0) e.openDays = "Elegí al menos un día de apertura.";
  const shiftsError = validateShifts(p.schedule.shifts);
  if (shiftsError) e.shifts = shiftsError;
  if (!isHexColor(p.theme.primary)) e.primary = "Color inválido.";
  else if (contrastRatio(p.theme.primary, p.theme.primaryForeground) < 4.5)
    e.primary = "Poco contraste con el texto del botón. Elegí un tono más oscuro o más claro.";
  if (!isHexColor(p.theme.accent)) e.accent = "Color inválido.";
  else if (contrastRatio(p.theme.accent, p.theme.accentForeground) < 4.5) e.accent = "Poco contraste con su texto.";
  return e;
}
