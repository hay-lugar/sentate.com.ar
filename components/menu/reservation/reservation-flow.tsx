"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import type { PublicTenant } from "@/lib/domain/types";
import { zonedNow } from "@/lib/time/zoned";
import { useZonedNow } from "@/lib/hooks/use-zoned-now";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/format";
import { DateTimeStep } from "./date-time-step";
import { DetailsStep } from "./details-step";
import { GuestsStep } from "./guests-step";
import { FailedView, SubmittedView } from "./result-view";
import { STEP_COUNT, useReservationRequest } from "./use-reservation-request";

const TITLES = ["¿Cuántos son?", "¿Cuándo vienen?", "Tus datos"];

export function ReservationFlow({ tenant, open, onClose }: { tenant: PublicTenant; open: boolean; onClose: () => void }) {
  const r = useReservationRequest(tenant, open);
  // "Ahora" para pintar horarios (se refresca cada 30 s); el envío revalida contra la hora real.
  const now = useZonedNow(tenant.timezone, zonedNow(tenant.timezone));
  const submitting = r.phase === "submitting";

  const header =
    r.phase === "submitted" || r.phase === "failed" ? null : (
      <div>
        <p className="text-[12px] font-semibold tracking-wide text-brand uppercase">
          Paso {r.step + 1} de {STEP_COUNT}
        </p>
        <h2 className="mt-0.5 text-[22px] font-bold">{TITLES[r.step]}</h2>
        <div
          className="mt-3 flex gap-1.5"
          role="progressbar"
          aria-label="Progreso de la reserva"
          aria-valuemin={1}
          aria-valuemax={STEP_COUNT}
          aria-valuenow={r.step + 1}
        >
          {TITLES.map((t, i) => (
            <div key={t} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={false}
                animate={{ width: i <= r.step ? "100%" : "0%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            </div>
          ))}
        </div>
      </div>
    );

  const footer =
    r.phase === "form" || r.phase === "submitting" ? (
      <div className="flex gap-3">
        {r.canGoBack && (
          <button
            type="button"
            onClick={() => r.goTo(r.step - 1)}
            aria-label="Paso anterior"
            className="pressable grid size-14 shrink-0 place-items-center rounded-2xl bg-background text-foreground ring-1 ring-line"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          disabled={submitting}
          aria-busy={submitting}
          onClick={() => (r.isLastStep ? r.submit() : r.next())}
          className={cn(
            "pressable flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl font-display text-[16px] font-bold",
            "bg-brand text-brand-fg shadow-brand disabled:opacity-70 disabled:active:scale-100",
          )}
        >
          {submitting ? (
            <>
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> Enviando solicitud…
            </>
          ) : r.isLastStep ? (
            "Enviar solicitud (demo)"
          ) : (
            "Continuar"
          )}
        </button>
      </div>
    ) : undefined;

  return (
    <BottomSheet open={open} onClose={onClose} label="Pedir una mesa" header={header} footer={footer}>
      {r.phase === "submitted" && r.summary ? (
        <SubmittedView tenantName={tenant.name} summary={r.summary} onClose={onClose} />
      ) : r.phase === "failed" ? (
        <FailedView onRetry={r.submit} onBack={r.backToForm} retrying={submitting} />
      ) : (
        <div className="relative overflow-x-hidden" aria-busy={submitting}>
          <AnimatePresence mode="popLayout" initial={false} custom={r.direction}>
            <motion.fieldset
              key={r.step}
              custom={r.direction}
              disabled={submitting}
              variants={{
                enter: (d: number) => ({ x: d * 48, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d * -48, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="min-w-0 px-6 pt-4 pb-6"
            >
              <legend className="sr-only">{TITLES[r.step]}</legend>
              {r.step === 0 && (
                <GuestsStep guests={r.draft.guests} onChange={(g) => r.update("guests", g)} phone={tenant.phone} error={r.errors.guests} />
              )}
              {r.step === 1 && (
                <DateTimeStep
                  tenant={tenant}
                  now={now}
                  guests={r.draft.guests}
                  serviceDate={r.draft.serviceDate}
                  time={r.draft.time}
                  onDate={(d) => r.update("serviceDate", d)}
                  onTime={(t) => r.update("time", t)}
                  errors={r.errors}
                />
              )}
              {r.step === 2 && <DetailsStep draft={r.draft} errors={r.errors} update={r.update} onEdit={r.goTo} />}
            </motion.fieldset>
          </AnimatePresence>
        </div>
      )}
    </BottomSheet>
  );
}
