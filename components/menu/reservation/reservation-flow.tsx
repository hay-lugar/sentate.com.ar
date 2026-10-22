"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { reservationConfigAction, type LiveReservationConfig } from "@/app/[slug]/actions";
import { ArrowLeft } from "lucide-react";
import type { PublicTenant } from "@/lib/domain/types";
import { zonedNow } from "@/lib/time/zoned";
import { useZonedNow } from "@/lib/hooks/use-zoned-now";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { DateTimeStep } from "./date-time-step";
import { DetailsStep } from "./details-step";
import { GuestsStep } from "./guests-step";
import { FailedView, SubmittedView } from "./result-view";
import { STEP_COUNT, useReservationRequest } from "./use-reservation-request";
import { demoSubmitter, liveSubmitter } from "./submitters";
import type { TenantSource } from "@/lib/data/resolve";

const TITLES = ["¿Cuántos son?", "¿Cuándo vienen?", "Tus datos"];

export function ReservationFlow({
  tenant,
  source,
  open,
  onClose,
}: {
  tenant: PublicTenant;
  source: TenantSource;
  open: boolean;
  onClose: () => void;
}) {
  const live = source === "live" && !!tenant.id;
  const submitter = useMemo(() => (live ? liveSubmitter(tenant.id!) : demoSubmitter), [live, tenant.id]);
  const [config, setConfig] = useState<LiveReservationConfig | null>(null);
  useEffect(() => {
    if (!live || !open) return;
    let cancelled = false;
    reservationConfigAction(tenant.id).then((c) => !cancelled && setConfig(c)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [live, open, tenant.id]);
  const maxGuests = live ? config?.max_party_size : undefined;
  const r = useReservationRequest(tenant, open, { submitter, fakeAvailability: !live, maxGuests });
  // "Ahora" para pintar horarios (se refresca cada 30 s); el envío revalida contra la hora real.
  const now = useZonedNow(tenant.timezone, zonedNow(tenant.timezone));
  const submitting = r.phase === "submitting";

  const header =
    r.phase === "submitted" || r.phase === "failed" ? null : (
      <div>
        <p className="type-help">
          Paso {r.step + 1} de {STEP_COUNT}
        </p>
        <h2 className="mt-0.5 type-section">{TITLES[r.step]}</h2>
        <div
          className="mt-3 flex gap-1.5"
          role="progressbar"
          aria-label="Progreso de la reserva"
          aria-valuemin={1}
          aria-valuemax={STEP_COUNT}
          aria-valuenow={r.step + 1}
        >
          {TITLES.map((t, i) => (
            <div key={t} className={cn("h-1 flex-1 rounded-full", i <= r.step ? "bg-brand" : "bg-line")} />
          ))}
        </div>
      </div>
    );

  const footer =
    r.phase === "form" || r.phase === "submitting" ? (
      <div className="flex gap-3">
        {r.canGoBack && (
          <Button variant="secondary" size="lg" onClick={() => r.goTo(r.step - 1)} aria-label="Paso anterior" className="px-4">
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
        )}
        <Button size="lg" pending={submitting} onClick={() => (r.isLastStep ? r.submit() : r.next())} className="flex-1">
          {submitting ? "Enviando solicitud…" : r.isLastStep ? (live ? "Enviar solicitud" : "Enviar solicitud (demo)") : "Continuar"}
        </Button>
      </div>
    ) : undefined;

  return (
    <BottomSheet open={open} onClose={onClose} label="Pedir una mesa" header={header} footer={footer}>
      {r.phase === "submitted" && r.summary ? (
        <SubmittedView tenantName={tenant.name} tenantPhone={tenant.phone} summary={r.summary} live={live} onClose={onClose} />
      ) : r.phase === "failed" ? (
        <FailedView message={r.failure} onRetry={r.submit} onBack={r.backToForm} retrying={submitting} />
      ) : (
        <div className="relative overflow-x-hidden" aria-busy={submitting}>
          <AnimatePresence mode="popLayout" initial={false} custom={r.direction}>
            <motion.fieldset
              key={r.step}
              custom={r.direction}
              disabled={submitting}
              variants={{
                enter: { opacity: 0 },
                center: { opacity: 1 },
                exit: { opacity: 0 },
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.15 }}
              className="min-w-0 px-6 pt-4 pb-6"
            >
              <legend className="sr-only">{TITLES[r.step]}</legend>
              {r.step === 0 && (
                <GuestsStep guests={r.draft.guests} onChange={(g) => r.update("guests", g)} phone={tenant.phone} error={r.errors.guests} max={maxGuests} />
              )}
              {r.step === 1 && (
                <DateTimeStep
                  tenant={tenant}
                  now={now}
                  guests={r.draft.guests}
                  fakeAvailability={!live}
                  liveTenantId={live ? tenant.id : undefined}
                  serviceDate={r.draft.serviceDate}
                  time={r.draft.time}
                  onDate={(d) => r.update("serviceDate", d)}
                  onTime={(t) => r.update("time", t)}
                  errors={r.errors}
                />
              )}
              {r.step === 2 && <DetailsStep draft={r.draft} errors={r.errors} update={r.update} onEdit={r.goTo} live={live} notifications={live && !!config?.notifications} />}
            </motion.fieldset>
          </AnimatePresence>
        </div>
      )}
    </BottomSheet>
  );
}
