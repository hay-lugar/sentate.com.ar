"use client";

import type { PlainDate, WallTime } from "@/lib/domain/types";
import { RESERVATION_LIMITS, type FieldErrors, type ReservationDraft } from "@/lib/reservation/validation";
import { capitalize, formatPlainDate } from "@/lib/time/zoned";
import { BRAND } from "@/lib/config/brand";
import { cn } from "@/lib/format";
import { FieldError, inputClass } from "./controls";

type Props = {
  draft: ReservationDraft;
  errors: FieldErrors;
  update: <K extends keyof ReservationDraft>(key: K, value: ReservationDraft[K]) => void;
  onEdit: (step: number) => void;
  /** Comercio real: los datos se envían al local. */
  live?: boolean;
  /** El comercio puede enviar avisos por email (proveedor configurado). Si no, no se ofrece: no se promete lo que no se hace. */
  notifications?: boolean;
};

export function DetailsStep({ draft, errors, update, onEdit, live = false, notifications = false }: Props) {
  return (
    <div>
      <Summary guests={draft.guests} serviceDate={draft.serviceDate} time={draft.time} onEdit={onEdit} />

      {live ? (
        <div className="mt-4 rounded-xl bg-subtle p-3 text-[0.8125rem] leading-snug text-muted">
          <span>
            Tu nombre y teléfono se comparten solo con este local para gestionar la solicitud. El local te responde por su cuenta (teléfono o WhatsApp).
            {notifications ? " Si querés, también te avisamos por email." : ` ${BRAND.name} no envía mensajes automáticos.`}
          </span>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-subtle p-3 text-[0.8125rem] leading-snug text-muted">
          <span>
            <b className="font-semibold text-foreground">Modo demo:</b> no se guarda ni se envía nada. Podés usar datos inventados.
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
            className={cn(inputClass, "h-auto resize-none py-3")}
          />
        </Field>
        {live && notifications && (
          <div className="rounded-2xl border border-line/70 p-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" checked={!!draft.notify} onChange={(e) => update("notify", e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-foreground" />
              <span className="text-[0.9375rem]">
                Avisarme por email cuando el local responda
                <span className="block type-help">Solo usamos tu email para avisarte del estado de esta solicitud. No es una confirmación.</span>
              </span>
            </label>
            {draft.notify && (
              <div className="mt-3">
                <Field label="Email" htmlFor="res-email" error={errors.email} errorId="err-email">
                  <input
                    id="res-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    enterKeyHint="done"
                    maxLength={120}
                    value={draft.email ?? ""}
                    onChange={(e) => update("email", e.target.value)}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "err-email" : undefined}
                    className={inputClass}
                  />
                </Field>
              </div>
            )}
          </div>
        )}
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
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between type-label">
        {label}
        {(optional || counter) && (
          <span className="text-[0.8125rem] font-normal text-muted">
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
    <div className="flex divide-x divide-line rounded-2xl border border-line/70">
      <SummaryItem label="Personas" value={String(guests)} onClick={() => onEdit(0)} />
      <SummaryItem label="Día" value={day} onClick={() => onEdit(1)} />
      <SummaryItem label="Hora" value={time ?? "—"} onClick={() => onEdit(1)} />
    </div>
  );
}

function SummaryItem({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Cambiar ${label.toLowerCase()}: ${value}`} className="pressable flex-1 px-3 py-3 text-center">
      <span className="block type-help">{label}</span>
      <span className="mt-0.5 block text-[1.0625rem] font-semibold">{value}</span>
      <span className="block text-[0.8125rem] underline underline-offset-2">Cambiar</span>
    </button>
  );
}
