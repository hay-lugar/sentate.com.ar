// Validación pura de una solicitud de reserva. Se usa por paso y otra vez,
// completa, al confirmar (la hora pudo haber pasado mientras el usuario completaba).

import type { PlainDate, Schedule, WallTime } from "@/lib/domain/types";
import { findSlot, isServiceDay, isSlotPast, type Slot } from "@/lib/domain/schedule";
import { addDays, daysBetween, isPlainDate, isWallTime, type ZonedNow } from "@/lib/time/zoned";

export const RESERVATION_LIMITS = {
  minGuests: 1,
  maxGuests: 8,
  nameMin: 2,
  nameMax: 80,
  phoneMinDigits: 8,
  phoneMaxDigits: 15,
  notesMax: 280,
  /** Anticipación mínima respecto del inicio del turno. */
  leadMinutes: 30,
  /** Fechas reservables desde hoy. */
  windowDays: 14,
} as const;

export type ReservationDraft = {
  guests: number;
  serviceDate: PlainDate | null;
  time: WallTime | null;
  name: string;
  phone: string;
  notes: string;
};

export const EMPTY_DRAFT: ReservationDraft = { guests: 2, serviceDate: null, time: null, name: "", phone: "", notes: "" };

export type ReservationField = keyof ReservationDraft;
export type FieldErrors = Partial<Record<ReservationField, string>>;

export type ValidationContext = {
  schedule: Schedule;
  now: ZonedNow;
  isFull: (slot: Slot, guests: number) => boolean;
};

const L = RESERVATION_LIMITS;

export function validateGuests(guests: number): FieldErrors {
  if (!Number.isInteger(guests) || guests < L.minGuests || guests > L.maxGuests) {
    return { guests: `Elegí entre ${L.minGuests} y ${L.maxGuests} personas.` };
  }
  return {};
}

export function validateSlot(draft: Pick<ReservationDraft, "guests" | "serviceDate" | "time">, ctx: ValidationContext): FieldErrors {
  const { serviceDate, time } = draft;
  if (!serviceDate || !isPlainDate(serviceDate)) return { serviceDate: "Elegí un día." };

  // La fecha de servicio de anoche es válida solo si su turno sigue en curso (se valida por horario abajo).
  const diff = daysBetween(ctx.now.date, serviceDate);
  if (diff < -1 || diff >= L.windowDays) return { serviceDate: "Esa fecha está fuera del período de reservas." };
  if (!isServiceDay(ctx.schedule, serviceDate)) return { serviceDate: "El local no abre ese día." };

  if (!time || !isWallTime(time)) return { time: "Elegí un horario." };
  const slot = findSlot(ctx.schedule, serviceDate, time);
  if (!slot) return { time: "Ese horario no existe para el día elegido." };
  if (isSlotPast(slot, ctx.now, L.leadMinutes)) return { time: "Ese horario ya pasó o está muy cerca. Elegí otro." };
  if (ctx.isFull(slot, draft.guests)) return { time: "Ese horario se completó. Elegí otro." };
  return {};
}

export const phoneDigits = (phone: string) => phone.replace(/\D/g, "");

export function validateContact(draft: Pick<ReservationDraft, "name" | "phone" | "notes">): FieldErrors {
  const errors: FieldErrors = {};
  const name = draft.name.trim();
  if (name.length < L.nameMin) errors.name = "Ingresá tu nombre.";
  else if (name.length > L.nameMax) errors.name = `Máximo ${L.nameMax} caracteres.`;

  const digits = phoneDigits(draft.phone);
  if (!/^[\d\s()+-]*$/.test(draft.phone)) errors.phone = "Usá solo números, espacios, +, - o paréntesis.";
  else if (digits.length < L.phoneMinDigits || digits.length > L.phoneMaxDigits)
    errors.phone = `Ingresá un teléfono de ${L.phoneMinDigits} a ${L.phoneMaxDigits} dígitos.`;

  if (draft.notes.length > L.notesMax) errors.notes = `Máximo ${L.notesMax} caracteres.`;
  return errors;
}

export type ValidationResult = { ok: true; errors: FieldErrors } | { ok: false; errors: FieldErrors };

/** Revalidación completa previa al envío. */
export function validateReservation(draft: ReservationDraft, ctx: ValidationContext): ValidationResult {
  const errors = { ...validateGuests(draft.guests), ...validateSlot(draft, ctx), ...validateContact(draft) };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, errors };
}

/** Paso al que hay que volver para corregir el primer error. */
export function stepForErrors(errors: FieldErrors): 0 | 1 | 2 {
  if (errors.guests) return 0;
  if (errors.serviceDate || errors.time) return 1;
  return 2;
}

export const lastBookableDate = (today: PlainDate) => addDays(today, L.windowDays - 1);
