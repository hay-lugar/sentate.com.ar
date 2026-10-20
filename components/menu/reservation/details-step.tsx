"use client";

import { ShieldCheck } from "lucide-react";
import type { PlainDate, WallTime } from "@/lib/domain/types";
import { RESERVATION_LIMITS, type FieldErrors, type ReservationDraft } from "@/lib/reservation/validation";
import { capitalize, formatPlainDate } from "@/lib/time/zoned";
import { cn } from "@/lib/format";
import { FieldError, inputClass } from "./controls";

type Props = {
  draft: ReservationDraft;
  errors: FieldErrors;
  update: <K extends keyof ReservationDraft>(key: K, value: ReservationDraft[K]) => void;
  onEdit: (step: number) => void;
  /** Comercio real: los datos se envían al local. */
  live?: boolean;
};

export function DetailsStep({ draft, errors, update, onEdit, live = false }: Props) {
  return (
    <div>
      <Summary guests={draft.guests} serviceDate={draft.serviceDate} time={draft.time} onEdit={onEdit} />

      {live ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-background p-3 text-[12px] leading-snug text-muted ring-1 ring-line/70">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Tu nombre y teléfono se comparten solo con este local para gestionar la solicitud.</span>
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-amber-50 p-3 text-[12px] leading-snug text-amber-900">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <b className="font-semibold">Modo demo:</b> no se guarda ni se envía nada. Podés usar datos inventados.
          </span>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <Field label="Nombre" htmlFor="res-name" error={errors.name} errorId="err-name">
          <input
            id="res-name"
            autoComplete={live ? "name" : "off"}
            enterKeyHint="next"
            maxLength={RESERVATION_LIMITS.nameMax + 10}
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Ej: Martina"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "err-name" : undefined}
            className={inputClass}
          />
        </Field>
        <Field label="Teléfono" htmlFor="res-phone" error={errors.phone} errorId="err-phone">
          <input
            id="res-phone"
            type="tel"
            inputMode="tel"
            autoComplete={live ? "tel" : "off"}
            enterKeyHint="next"
            value={draft.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="11 5555-5555"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "err-phone" : undefined}
            className={inputClass}
          />
        </Field>
        <Field
          label="Comentarios"
          optional
          htmlFor="res-notes"
          error={errors.notes}
          errorId="err-notes"
          counter={`${draft.notes.length}/${RESERVATION_LIMITS.notesMax}`}
        >
          <textarea
            id="res-notes"
            rows={2}
            value={draft.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Cumpleaños, silla de bebé, alergias…"
            aria-invalid={!!errors.notes}
            aria-describedby={errors.notes ? "err-notes" : undefined}
            className={cn(inputClass, "h-auto resize-none py-3.5")}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  error,
  errorId,
  counter,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  error?: string;
  errorId: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between px-1 text-[13px] font-semibold">
        {label}
        {(optional || counter) && (
          <span className="text-[12px] font-medium text-muted">
            {optional && "Opcional"}
            {counter && ` · ${counter}`}
          </span>
        )}
      </label>
      {children}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

function Summary({ guests, serviceDate, time, onEdit }: { guests: number; serviceDate: PlainDate | null; time: WallTime | null; onEdit: (step: number) => void }) {
  const day = serviceDate ? capitalize(formatPlainDate(serviceDate, { weekday: "short", day: "numeric" })) : "—";
  return (
    <div className="flex divide-x divide-line rounded-3xl bg-background ring-1 ring-line/70">
      <SummaryItem label="Personas" value={String(guests)} onClick={() => onEdit(0)} />
      <SummaryItem label="Día" value={day} onClick={() => onEdit(1)} />
      <SummaryItem label="Hora" value={time ?? "—"} onClick={() => onEdit(1)} />
    </div>
  );
}

function SummaryItem({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Cambiar ${label.toLowerCase()}: ${value}`} className="pressable flex-1 rounded-3xl px-3 py-3 text-center">
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className="mt-0.5 block font-display text-[17px] font-bold">{value}</span>
      <span className="block text-[11px] font-semibold text-brand">Cambiar</span>
    </button>
  );
}
