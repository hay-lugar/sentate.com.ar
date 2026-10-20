// Horarios de servicio: turnos, fecha de servicio vs. fecha calendario y estado abierto/cerrado.
//
// Regla: un horario pertenece a la fecha de servicio en la que ABRIÓ su turno.
// Si el turno 20:00–00:30 abre el viernes, el horario 00:15 es del servicio del
// viernes aunque su fecha calendario sea el sábado. No hay cortes arbitrarios.

import type { ClosureDay, PlainDate, Schedule, Shift, WallTime } from "./types";
import {
  absoluteMinutes,
  addDays,
  capitalize,
  daysBetween,
  formatPlainDate,
  fromMinutes,
  toMinutes,
  weekdayOf,
  type ZonedNow,
} from "@/lib/time/zoned";

export const SLOT_STEP_MINUTES = 30;
/** Última mesa: una hora antes del cierre. */
export const LAST_SEATING_BEFORE_CLOSE = 60;

export const crossesMidnight = (shift: Shift) => toMinutes(shift.close) <= toMinutes(shift.open);

export function shiftDuration(shift: Shift) {
  const open = toMinutes(shift.open);
  const close = toMinutes(shift.close);
  return close > open ? close - open : close + 1440 - open;
}

export type Slot = {
  serviceDate: PlainDate;
  calendarDate: PlainDate;
  time: WallTime;
  shiftId: string;
  shiftLabel: string;
  /** true si el horario cae después de medianoche respecto de la fecha de servicio. */
  afterMidnight: boolean;
};

export const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** Arma un horario semanal con los mismos turnos en todos los días indicados (fixtures y tests). */
export function weeklySchedule(openDays: number[], shifts: Omit<Shift, "id">[] | Shift[], closures: ClosureDay[] = []): Schedule {
  return {
    week: Array.from({ length: 7 }, (_, day) =>
      openDays.includes(day) ? shifts.map((s, i) => ({ ...s, id: `d${day}-${"id" in s ? s.id : i + 1}` })) : [],
    ),
    closures,
  };
}

export const closureFor = (schedule: Schedule, serviceDate: PlainDate) => schedule.closures.find((c) => c.date === serviceDate);

/** Turnos de una fecha de servicio: los del día de la semana, salvo cierre excepcional. */
export function shiftsOn(schedule: Schedule, serviceDate: PlainDate): Shift[] {
  if (closureFor(schedule, serviceDate)) return [];
  return schedule.week[weekdayOf(serviceDate)] ?? [];
}

export const isServiceDay = (schedule: Schedule, serviceDate: PlainDate) => shiftsOn(schedule, serviceDate).length > 0;

/** Días de la semana con al menos un turno. */
export const openWeekdays = (schedule: Schedule) => schedule.week.flatMap((shifts, day) => (shifts.length ? [day] : []));

const shiftKey = (s: Shift) => `${s.open}-${s.close}`;
const dayKey = (shifts: Shift[]) => shifts.map(shiftKey).join(",");

/**
 * Resumen legible para el comensal, agrupando días con los mismos horarios.
 * Ej.: ["Mar a Sáb · 12:00–16:00 · 20:00–00:30", "Dom · 12:00–16:00"].
 */
export function describeWeek(schedule: Schedule): string[] {
  const SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  // Empieza el lunes para agrupar "Lun a Dom" de forma natural.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: { days: number[]; shifts: Shift[] }[] = [];
  for (const day of order) {
    const shifts = schedule.week[day] ?? [];
    if (!shifts.length) continue;
    const last = groups[groups.length - 1];
    const prevDay = last?.days[last.days.length - 1];
    const contiguous = last && order.indexOf(day) === order.indexOf(prevDay!) + 1;
    if (last && contiguous && dayKey(last.shifts) === dayKey(shifts)) last.days.push(day);
    else groups.push({ days: [day], shifts });
  }
  return groups.map((g) => {
    const days =
      g.days.length === 1
        ? SHORT[g.days[0]]
        : g.days.length === 2
          ? `${SHORT[g.days[0]]} y ${SHORT[g.days[1]]}`
          : `${SHORT[g.days[0]]} a ${SHORT[g.days[g.days.length - 1]]}`;
    return `${days} · ${g.shifts.map((s) => `${s.open}–${s.close}`).join(" · ")}`;
  });
}

/** Horarios reservables de una fecha de servicio, ordenados cronológicamente. */
export function slotsForServiceDate(schedule: Schedule, serviceDate: PlainDate): Slot[] {
  const shifts = shiftsOn(schedule, serviceDate);
  if (!shifts.length) return [];
  const slots: Slot[] = [];
  for (const shift of shifts) {
    const open = toMinutes(shift.open);
    const last = open + shiftDuration(shift) - LAST_SEATING_BEFORE_CLOSE;
    for (let m = Math.ceil(open / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES; m <= last; m += SLOT_STEP_MINUTES) {
      const dayShift = Math.floor(m / 1440);
      slots.push({
        serviceDate,
        calendarDate: addDays(serviceDate, dayShift),
        time: fromMinutes(m),
        shiftId: shift.id,
        shiftLabel: shift.label,
        afterMidnight: dayShift > 0,
      });
    }
  }
  return slots.sort((a, b) => slotAbsolute(a) - slotAbsolute(b));
}

export const slotAbsolute = (slot: Pick<Slot, "calendarDate" | "time">) =>
  absoluteMinutes(slot.calendarDate, toMinutes(slot.time));

/** Un turno ya pasó si empieza antes de `ahora + anticipación`. */
export const isSlotPast = (slot: Slot, now: ZonedNow, leadMinutes: number) =>
  slotAbsolute(slot) < absoluteMinutes(now.date, now.minutes) + leadMinutes;

export function findSlot(schedule: Schedule, serviceDate: PlainDate, time: WallTime) {
  return slotsForServiceDate(schedule, serviceDate).find((s) => s.time === time);
}

/* ───────────── Abierto / cerrado ───────────── */

export type OpenState =
  | { open: true; closesAt: WallTime; label: string }
  | { open: false; label: string; next?: { calendarDate: PlainDate; time: WallTime } };

export function getOpenState(schedule: Schedule, now: ZonedNow): OpenState {
  const nowAbs = absoluteMinutes(now.date, now.minutes);
  let next: { abs: number; calendarDate: PlainDate; time: WallTime } | undefined;

  // Desde ayer (turnos que cruzan medianoche) hasta una semana adelante.
  for (let offset = -1; offset <= 7; offset++) {
    const serviceDate = addDays(now.date, offset);
    for (const shift of shiftsOn(schedule, serviceDate)) {
      const start = absoluteMinutes(serviceDate, toMinutes(shift.open));
      const end = start + shiftDuration(shift);
      if (start <= nowAbs && nowAbs < end) {
        return { open: true, closesAt: shift.close, label: `Cierra a las ${shift.close}` };
      }
      if (start > nowAbs && (!next || start < next.abs)) {
        next = { abs: start, calendarDate: serviceDate, time: shift.open };
      }
    }
  }

  if (!next) return { open: false, label: openWeekdays(schedule).length ? "Cerrado por unos días" : "Sin horarios cargados" };
  const diff = daysBetween(now.date, next.calendarDate);
  const when =
    diff === 0
      ? "hoy"
      : diff === 1
        ? "mañana"
        : `el ${formatPlainDate(next.calendarDate, { weekday: "long" })}`;
  return {
    open: false,
    label: `Abre ${when} a las ${next.time}`,
    next: { calendarDate: next.calendarDate, time: next.time },
  };
}

/* ───────────── Fechas reservables ───────────── */

export type BookableDay = {
  serviceDate: PlainDate;
  label: string;
  sublabel: string;
  closed: boolean;
  /** Motivo del cierre excepcional, si lo hay. */
  closedReason?: string;
};

/**
 * Días a mostrar en el calendario: la fecha de servicio en curso (si un turno de
 * anoche sigue abierto y tiene horarios futuros) + `windowDays` fechas desde hoy.
 */
export function bookableDays(schedule: Schedule, now: ZonedNow, windowDays: number, leadMinutes: number): BookableDay[] {
  const days: BookableDay[] = [];
  const yesterday = addDays(now.date, -1);
  const lateSlots = slotsForServiceDate(schedule, yesterday).filter((s) => !isSlotPast(s, now, leadMinutes));
  if (lateSlots.length) {
    days.push({ serviceDate: yesterday, label: "Turno actual", sublabel: "Esta noche", closed: false });
  }
  for (let i = 0; i < windowDays; i++) {
    const serviceDate = addDays(now.date, i);
    days.push({
      serviceDate,
      label: i === 0 ? "Hoy" : i === 1 ? "Mañ" : formatPlainDate(serviceDate, { weekday: "short" }),
      sublabel: formatPlainDate(serviceDate, { month: "short" }),
      closed: !isServiceDay(schedule, serviceDate),
      closedReason: closureFor(schedule, serviceDate)?.reason || undefined,
    });
  }
  return days;
}

export function describeSlot(slot: Slot) {
  const date = capitalize(formatPlainDate(slot.serviceDate, { weekday: "short", day: "numeric", month: "short" }));
  return slot.afterMidnight ? `${date} · ${slot.time} (madrugada)` : `${date} · ${slot.time}`;
}
