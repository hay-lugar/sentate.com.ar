import type { Reservation, Schedule } from "@/lib/domain/types";
import { findSlot, slotAbsolute } from "@/lib/domain/schedule";
import { absoluteMinutes, addDays, relativeDayLabel, toMinutes, type ZonedNow } from "@/lib/time/zoned";

/** Resuelve la fecha de servicio de una reserva y si cae después de medianoche. */
export function resolveReservationTime(r: Reservation, schedule: Schedule, now: ZonedNow) {
  const serviceDate = addDays(now.date, r.dayOffset);
  const slot = findSlot(schedule, serviceDate, r.time);
  const afterMidnight = slot?.afterMidnight ?? false;
  return {
    serviceDate,
    afterMidnight,
    dayLabel: relativeDayLabel(serviceDate, now.date),
    /** Para ordenar cronológicamente (01:00 del servicio de hoy va después de las 22:00). */
    sortKey: slot ? slotAbsolute(slot) : absoluteMinutes(serviceDate, toMinutes(r.time)),
  };
}
