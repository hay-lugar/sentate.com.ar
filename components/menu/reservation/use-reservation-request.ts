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
import { simulateRequest } from "@/lib/demo/simulate";
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
export function useReservationRequest(tenant: PublicTenant, open: boolean) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [draft, setDraft] = useState<ReservationDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<Phase>("form");
  const [summary, setSummary] = useState<SubmittedSummary | null>(null);

  const inFlight = useRef<AbortController | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const context = useCallback(
    (): ValidationContext => ({
      schedule: tenant.schedule,
      now: zonedNow(tenant.timezone),
      isFull: (slot, guests) => isSlotFullMock(tenant.slug, slot, guests),
    }),
    [tenant],
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
    try {
      await simulateRequest(controller.signal);
      if (controller.signal.aborted) return;
      setSummary({ guests: draft.guests, slot, firstName: draft.name.trim().split(/\s+/)[0] });
      // Los datos de contacto no se conservan: solo el resumen sin teléfono ni comentarios.
      setDraft(EMPTY_DRAFT);
      setPhase("submitted");
    } catch {
      if (controller.signal.aborted) return;
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
    update,
    goTo,
    next,
    submit,
    backToForm: () => setPhase("form"),
    canGoBack: step > 0 && phase === "form",
    isLastStep: step === STEP_COUNT - 1,
  };
}
