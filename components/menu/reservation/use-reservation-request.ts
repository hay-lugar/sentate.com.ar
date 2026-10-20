"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicTenant } from "@/lib/domain/types";
import { findSlot, type Slot } from "@/lib/domain/schedule";
import { isSlotFullMock } from "@/lib/reservation/availability";
import {
  EMPTY_DRAFT,
  stepForErrors,
  validateContact,
  validateGuests,
  validateReservation,
  validateSlot,
  type FieldErrors,
  type ReservationDraft,
  type ValidationContext,
} from "@/lib/reservation/validation";
import type { Submitter } from "./submitters";
import { zonedNow } from "@/lib/time/zoned";

export type Phase = "form" | "submitting" | "submitted" | "failed";
export const STEP_COUNT = 3;

/** Resumen de lo enviado, sin datos personales (para la pantalla de resultado). */
export type SubmittedSummary = { guests: number; slot: Slot; firstName: string };

/**
 * Lógica del flujo de reserva, separada de la UI:
 * validación por paso, revalidación completa al enviar, envío simulado
 * cancelable, protección contra doble envío y limpieza de temporizadores.
 * Los datos ingresados viven solo en memoria y se descartan al cerrar.
 */
export type ReservationRequestOptions = {
  submitter: Submitter;
  /** Demo: disponibilidad ficticia. Comercio real: no se inventan cupos (todo es solicitud). */
  fakeAvailability: boolean;
};

export function useReservationRequest(tenant: PublicTenant, open: boolean, { submitter, fakeAvailability }: ReservationRequestOptions) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [draft, setDraft] = useState<ReservationDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<Phase>("form");
  const [summary, setSummary] = useState<SubmittedSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Clave de idempotencia estable mientras el contenido no cambie: un reintento del mismo
  // envío no duplica; si el usuario edita algo, es una solicitud nueva.
  const idempotency = useRef<{ payload: string; key: string } | null>(null);

  const inFlight = useRef<AbortController | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const context = useCallback(
    (): ValidationContext => ({
      schedule: tenant.schedule,
      now: zonedNow(tenant.timezone),
      isFull: (slot, guests) => fakeAvailability && isSlotFullMock(tenant.slug, slot, guests),
    }),
    [tenant, fakeAvailability],
  );

  // Al cerrar: cancela el envío en curso y descarta los datos tras la animación de salida.
  useEffect(() => {
    if (open) {
      clearTimeout(resetTimer.current);
      return;
    }
    inFlight.current?.abort();
    inFlight.current = null;
    resetTimer.current = setTimeout(() => {
      setStep(0);
      setDraft(EMPTY_DRAFT);
      setErrors({});
      setPhase("form");
      setSummary(null);
      setFailure(null);
      idempotency.current = null;
    }, 350);
    return () => clearTimeout(resetTimer.current);
  }, [open]);

  useEffect(
    () => () => {
      inFlight.current?.abort();
      clearTimeout(resetTimer.current);
    },
    [],
  );

  const update = useCallback(<K extends keyof ReservationDraft>(key: K, value: ReservationDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value, ...(key === "serviceDate" ? { time: null } : {}) }));
    setErrors((e) => {
      if (!e[key] && !(key === "serviceDate" && e.time)) return e;
      const next = { ...e };
      delete next[key];
      if (key === "serviceDate") delete next.time;
      return next;
    });
  }, []);

  const goTo = useCallback((to: number) => {
    setDirection(to > step ? 1 : -1);
    setStep(Math.max(0, Math.min(STEP_COUNT - 1, to)));
  }, [step]);

  const validateStep = (s: number): FieldErrors =>
    s === 0 ? validateGuests(draft.guests) : s === 1 ? validateSlot(draft, context()) : validateContact(draft);

  const next = () => {
    const stepErrors = validateStep(step);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) goTo(step + 1);
  };

  const submit = async () => {
    if (inFlight.current) return; // evita doble envío
    const ctx = context();
    const result = validateReservation(draft, ctx);
    if (!result.ok) {
      setErrors(result.errors);
      goTo(stepForErrors(result.errors));
      return;
    }
    const slot = findSlot(ctx.schedule, draft.serviceDate!, draft.time!)!;
    const controller = new AbortController();
    inFlight.current = controller;
    setPhase("submitting");
    const payload = JSON.stringify(draft);
    if (idempotency.current?.payload !== payload) idempotency.current = { payload, key: crypto.randomUUID() };
    try {
      const res = await submitter(draft, idempotency.current.key, controller.signal);
      if (controller.signal.aborted) return;
      if (res.ok) {
        setSummary({ guests: draft.guests, slot, firstName: draft.name.trim().split(/\s+/)[0] });
        // Los datos de contacto no se conservan: solo el resumen sin teléfono ni comentarios.
        setDraft(EMPTY_DRAFT);
        idempotency.current = null;
        setPhase("submitted");
      } else if (res.field) {
        // Error de un dato puntual (p. ej. el horario se ocupó o pasó): volver a ese paso.
        setErrors({ [res.field]: res.message });
        goTo(stepForErrors({ [res.field]: res.message }));
        setPhase("form");
      } else {
        setFailure(res.message);
        setPhase("failed");
      }
    } catch {
      if (controller.signal.aborted) return;
      setFailure("No pudimos enviar la solicitud. Revisá tu conexión e intentá de nuevo.");
      setPhase("failed");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  };

  return {
    step,
    direction,
    draft,
    errors,
    phase,
    summary,
    failure,
    update,
    goTo,
    next,
    submit,
    backToForm: () => setPhase("form"),
    canGoBack: step > 0 && phase === "form",
    isLastStep: step === STEP_COUNT - 1,
  };
}
