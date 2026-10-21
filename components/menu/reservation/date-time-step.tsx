"use client";

import { CalendarDays, Clock3, Moon } from "lucide-react";
import { useMemo } from "react";
import type { PlainDate, PublicTenant, WallTime } from "@/lib/domain/types";
import { bookableDays, isSlotPast, shiftsOn, slotsForServiceDate, type Slot } from "@/lib/domain/schedule";
import { isSlotFullMock } from "@/lib/reservation/availability";
import { RESERVATION_LIMITS } from "@/lib/reservation/validation";
import { formatPlainDate, type ZonedNow } from "@/lib/time/zoned";
import { cn } from "@/lib/format";
import { Chip, FieldError, SectionLabel } from "./controls";

type Props = {
  tenant: PublicTenant;
  now: ZonedNow;
  guests: number;
  /** Solo demo: marca horarios como "completos" de forma ficticia. */
  fakeAvailability: boolean;
  serviceDate: PlainDate | null;
  time: WallTime | null;
  onDate: (d: PlainDate) => void;
  onTime: (t: WallTime) => void;
  errors: { serviceDate?: string; time?: string };
};

type SlotState = "free" | "past" | "full";

export function DateTimeStep({ tenant, now, guests, fakeAvailability, serviceDate, time, onDate, onTime, errors }: Props) {
  const days = useMemo(
    () => bookableDays(tenant.schedule, now, RESERVATION_LIMITS.windowDays, RESERVATION_LIMITS.leadMinutes),
    [tenant.schedule, now],
  );

  const slots = useMemo(() => (serviceDate ? slotsForServiceDate(tenant.schedule, serviceDate) : []), [tenant.schedule, serviceDate]);
  const stateOf = (slot: Slot): SlotState =>
    isSlotPast(slot, now, RESERVATION_LIMITS.leadMinutes) ? "past" : fakeAvailability && isSlotFullMock(tenant.slug, slot, guests) ? "full" : "free";

  const groups = (serviceDate ? shiftsOn(tenant.schedule, serviceDate) : [])
    .map((shift) => ({ shift, items: slots.filter((s) => s.shiftId === shift.id) }))
    .filter((g) => g.items.length);
  const anyFree = slots.some((s) => stateOf(s) === "free");

  return (
    <div>
      <SectionLabel icon={CalendarDays} id="lbl-dia">
        Elegí el día
      </SectionLabel>
      <div role="group" aria-labelledby="lbl-dia" className="no-scrollbar -mx-6 flex snap-x gap-2 overflow-x-auto px-6 pb-1">
        {days.map((d) => {
          const selected = d.serviceDate === serviceDate;
          return (
            <button
              key={d.serviceDate}
              type="button"
              disabled={d.closed}
              aria-pressed={selected}
              aria-label={`${d.label} ${formatPlainDate(d.serviceDate, { weekday: "long", day: "numeric", month: "long" })}${d.closed ? `, cerrado${d.closedReason ? ` (${d.closedReason})` : ""}` : ""}`}
              onClick={() => onDate(d.serviceDate)}
              className={cn(
                "pressable flex w-[4.25rem] shrink-0 snap-start flex-col items-center rounded-xl py-3 ring-1",
                selected ? "bg-brand text-brand-fg ring-brand" : "bg-surface ring-line-strong hover:bg-subtle",
                d.closed && "opacity-50",
              )}
            >
              <span className={cn("max-w-full truncate px-1 text-[11px] font-semibold uppercase", !selected && "text-muted")}>{d.label}</span>
              <span className="mt-0.5 text-[22px] leading-tight font-semibold">{Number(d.serviceDate.slice(8))}</span>
              <span className={cn("max-w-full truncate px-1 text-[11px] font-medium", !selected && "text-muted")} title={d.closedReason}>
                {d.closed ? (d.closedReason ? "Cierre" : "Cerrado") : d.sublabel}
              </span>
            </button>
          );
        })}
      </div>
      <FieldError id="err-date">{errors.serviceDate}</FieldError>

      <SectionLabel icon={Clock3} className="mt-6" id="lbl-hora">
        Elegí el horario
      </SectionLabel>
      {!serviceDate ? (
        <div className="grid h-28 place-items-center rounded-xl border border-line px-4 text-center text-[14px] text-muted">
          Primero elegí un día
        </div>
      ) : !anyFree ? (
        <div className="grid h-28 place-items-center rounded-xl border border-line px-4 text-center text-[14px] text-muted">
          No quedan horarios para este día. Probá con otra fecha.
        </div>
      ) : (
        <div key={serviceDate} className="space-y-4" role="group" aria-labelledby="lbl-hora">
          {groups.map(({ shift, items }) => (
            <div key={shift.id}>
              <p className="mb-2 text-[13px] text-muted">
                {shift.label} · {shift.open}–{shift.close}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {items.map((slot) => {
                  const state = stateOf(slot);
                  const reason = state === "past" ? "ya pasó" : state === "full" ? "completo" : "";
                  return (
                    <Chip
                      key={slot.time}
                      selected={time === slot.time}
                      disabled={state !== "free"}
                      onClick={() => onTime(slot.time)}
                      aria-label={`${slot.time}${slot.afterMidnight ? `, madrugada del ${formatPlainDate(slot.calendarDate, { weekday: "long" })}` : ""}${reason ? `, ${reason}` : ""}`}
                      className={cn("relative h-11 text-[14px] tabular-nums", state !== "free" && "line-through")}
                    >
                      {slot.time}
                      {slot.afterMidnight && <Moon className="absolute top-1 right-1 size-3 opacity-70" aria-hidden />}
                    </Chip>
                  );
                })}
              </div>
              {items.some((s) => s.afterMidnight) && (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
                  <Moon className="size-3" aria-hidden /> Después de medianoche: corresponde al{" "}
                  {formatPlainDate(items.find((s) => s.afterMidnight)!.calendarDate, { weekday: "long", day: "numeric" })} en el calendario.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <FieldError id="err-time">{errors.time}</FieldError>
      <p className="mt-4 text-[13px] text-muted">
        {fakeAvailability
          ? "Disponibilidad ficticia de la demo."
          : "Es una solicitud: el local la confirma según su disponibilidad."}{" "}
        Horarios del local ({tenant.timezone === "America/Argentina/Buenos_Aires" ? "hora de Argentina" : tenant.timezone}).
      </p>
    </div>
  );
}
