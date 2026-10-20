"use client";

import { CalendarOff, Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ClosureDay, Schedule, Shift } from "@/lib/domain/types";
import { PROFILE_LIMITS, type ProfileErrors } from "@/lib/demo/profile-validation";
import { crossesMidnight, WEEKDAY_NAMES } from "@/lib/domain/schedule";
import { formatPlainDate, fromMinutes, zonedNow } from "@/lib/time/zoned";
import { cn } from "@/lib/format";
import { FieldError, inputClass } from "@/components/menu/reservation/controls";

// Lunes primero: es como lo piensa un local gastronómico.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => fromMinutes(i * 15));

let shiftSeq = 0;
const newShiftId = (day: number) => `nuevo-${day}-${Date.now()}-${++shiftSeq}`;

/**
 * Editor de horarios por día de la semana + cierres excepcionales.
 * Cada día conserva sus propios turnos: nada se colapsa a "todos los días iguales".
 */
export function ScheduleEditor({
  idPrefix,
  schedule,
  timeZone,
  errors,
  onChange,
}: {
  idPrefix: string;
  schedule: Schedule;
  timeZone: string;
  errors: ProfileErrors;
  onChange: (schedule: Schedule) => void;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  const setDay = (day: number, shifts: Shift[]) =>
    onChange({ ...schedule, week: schedule.week.map((s, d) => (d === day ? shifts : s)) });

  const copyToOpenDays = (from: number) => {
    const source = schedule.week[from];
    onChange({
      ...schedule,
      week: schedule.week.map((s, d) => (d === from || s.length === 0 ? s : source.map((sh) => ({ ...sh, id: newShiftId(d) })))),
    });
  };

  return (
    <div>
      <fieldset aria-describedby={errors.schedule ? id("schedule-error") : undefined}>
        <legend className="mb-1 px-1 text-[13px] font-semibold">Horarios por día</legend>
        <p className="mb-3 px-1 text-[12px] text-muted">
          Cada día puede tener turnos distintos. Si un turno cierra después de medianoche (ej. 20:00–00:30), esos horarios pertenecen
          al día en que abrió.
        </p>
        <FieldError id={id("schedule-error")}>{errors.schedule}</FieldError>
        <ul className="space-y-2">
          {ORDER.map((day) => {
            const shifts = schedule.week[day] ?? [];
            const open = shifts.length > 0;
            const dayError = errors[`day${day}` as keyof ProfileErrors];
            const dayName = WEEKDAY_NAMES[day];
            return (
              <li key={day} className="rounded-2xl bg-background p-2.5" aria-label={`Horarios del ${dayName}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[5.5rem] px-1 text-[14px] font-semibold capitalize">{dayName}</span>
                  <button
                    type="button"
                    aria-pressed={open}
                    aria-label={`${dayName}: ${open ? "abierto" : "cerrado"}`}
                    onClick={() =>
                      setDay(day, open ? [] : [{ id: newShiftId(day), label: "Turno", open: "12:00", close: "16:00" }])
                    }
                    className={cn(
                      "pressable h-9 rounded-xl px-3 text-[12px] font-semibold ring-1",
                      open ? "bg-brand text-brand-fg ring-brand" : "bg-surface text-muted ring-line",
                    )}
                  >
                    {open ? "Abierto" : "Cerrado"}
                  </button>
                  {open && (
                    <button
                      type="button"
                      onClick={() => copyToOpenDays(day)}
                      className="pressable ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-semibold text-muted hover:bg-surface hover:text-foreground"
                    >
                      <Copy className="size-3.5" aria-hidden /> Copiar a los días abiertos
                      <span className="sr-only"> (desde el {dayName})</span>
                    </button>
                  )}
                </div>

                {open && (
                  <ul className="mt-2 space-y-2">
                    {shifts.map((s, i) => (
                      <li
                        key={s.id}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                      >
                        <div className="col-span-3 sm:col-span-1">
                          <label htmlFor={id(`d${day}-s${i}-label`)} className="mb-1 block px-1 text-[11px] font-semibold text-muted">
                            Nombre del turno
                          </label>
                          <input
                            id={id(`d${day}-s${i}-label`)}
                            value={s.label}
                            maxLength={PROFILE_LIMITS.shiftLabelMax}
                            onChange={(e) => setDay(day, shifts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                            className={cn(inputClass, "h-11 bg-surface")}
                          />
                        </div>
                        <TimeSelect
                          id={id(`d${day}-s${i}-open`)}
                          label="Abre"
                          value={s.open}
                          onChange={(v) => setDay(day, shifts.map((x, j) => (j === i ? { ...x, open: v } : x)))}
                        />
                        <TimeSelect
                          id={id(`d${day}-s${i}-close`)}
                          label={crossesMidnight(s) ? "Cierra (madrugada)" : "Cierra"}
                          value={s.close}
                          onChange={(v) => setDay(day, shifts.map((x, j) => (j === i ? { ...x, close: v } : x)))}
                        />
                        <button
                          type="button"
                          aria-label={`Quitar turno ${s.label || i + 1} del ${dayName}`}
                          onClick={() => setDay(day, shifts.filter((_, j) => j !== i))}
                          className="pressable grid size-11 place-items-center rounded-xl text-muted hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {open && shifts.length < PROFILE_LIMITS.maxShifts && (
                  <button
                    type="button"
                    onClick={() => setDay(day, [...shifts, { id: newShiftId(day), label: "Nuevo turno", open: "20:00", close: "23:30" }])}
                    className="pressable mt-1 inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-semibold text-brand hover:bg-brand-soft"
                  >
                    <Plus className="size-3.5" aria-hidden /> Agregar turno<span className="sr-only"> el {dayName}</span>
                  </button>
                )}
                <FieldError id={id(`d${day}-error`)}>{dayError}</FieldError>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <ClosuresEditor
        idPrefix={idPrefix}
        closures={schedule.closures}
        timeZone={timeZone}
        error={errors.closures}
        onChange={(closures) => onChange({ ...schedule, closures })}
      />
    </div>
  );
}

function ClosuresEditor({
  idPrefix,
  closures,
  timeZone,
  error,
  onChange,
}: {
  idPrefix: string;
  closures: ClosureDay[];
  timeZone: string;
  error?: string;
  onChange: (c: ClosureDay[]) => void;
}) {
  const today = zonedNow(timeZone).date;
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const id = (k: string) => `${idPrefix}-closure-${k}`;
  const upcoming = closures.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  const add = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setLocalError("Elegí una fecha.");
    if (date < today) return setLocalError("La fecha ya pasó.");
    if (closures.some((c) => c.date === date)) return setLocalError("Esa fecha ya está cerrada.");
    if (closures.length >= PROFILE_LIMITS.maxClosures) return setLocalError(`Máximo ${PROFILE_LIMITS.maxClosures} cierres.`);
    onChange([...closures, { date, reason: reason.trim() }]);
    setDate("");
    setReason("");
    setLocalError(null);
  };

  return (
    <fieldset className="mt-5" aria-describedby={error || localError ? id("error") : undefined}>
      <legend className="mb-1 px-1 text-[13px] font-semibold">Cierres excepcionales</legend>
      <p className="mb-3 px-1 text-[12px] text-muted">Feriados, vacaciones o eventos privados: ese día no se toman reservas.</p>
      {upcoming.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {upcoming.map((c) => (
            <li key={c.date} className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 text-[13px]">
              <CalendarOff className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="font-semibold capitalize">{formatPlainDate(c.date, { weekday: "short", day: "numeric", month: "short" })}</span>
              {c.reason && <span className="min-w-0 truncate text-muted">· {c.reason}</span>}
              <button
                type="button"
                aria-label={`Quitar cierre del ${formatPlainDate(c.date, { weekday: "long", day: "numeric", month: "long" })}`}
                onClick={() => onChange(closures.filter((x) => x.date !== c.date))}
                className="pressable ml-auto grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor={id("date")} className="mb-1 block px-1 text-[11px] font-semibold text-muted">
            Fecha
          </label>
          <input id={id("date")} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClass, "h-11")} />
        </div>
        <div>
          <label htmlFor={id("reason")} className="mb-1 block px-1 text-[11px] font-semibold text-muted">
            Motivo (opcional, lo ven los clientes)
          </label>
          <input
            id={id("reason")}
            value={reason}
            maxLength={PROFILE_LIMITS.closureReasonMax}
            onChange={(e) => setReason(e.target.value)}
            className={cn(inputClass, "h-11")}
          />
        </div>
        <button
          type="button"
          onClick={add}
          className="pressable inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-brand ring-1 ring-line hover:bg-brand-soft"
        >
          <Plus className="size-4" aria-hidden /> Agregar cierre
        </button>
      </div>
      <FieldError id={id("error")}>{localError ?? error}</FieldError>
    </fieldset>
  );
}

// Selector HH:MM explícito (24 h, cada 15'): evita que el input nativo cambie de formato según el locale.
function TimeSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const options = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [value, ...TIME_OPTIONS];
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block px-1 text-[11px] font-semibold text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "h-11 w-full min-w-0 bg-surface px-3 tabular-nums sm:w-[6.5rem]")}
      >
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
