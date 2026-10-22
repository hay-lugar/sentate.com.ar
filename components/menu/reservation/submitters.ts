// Quién envía la solicitud: la demo (simulada) o un comercio real (Server Action → Supabase).
// El flujo de UI es el mismo; cambia solo el destino.

import type { ReservationDraft } from "@/lib/reservation/validation";
import { reservationErrorInfo, type ReservationErrorInfo } from "@/lib/reservation/errors";
import { simulateRequest, SimulatedError } from "@/lib/demo/simulate";
import { requestReservationAction } from "@/app/[slug]/actions";

export type SubmitResult = { ok: true } | ({ ok: false } & ReservationErrorInfo);
export type Submitter = (draft: ReservationDraft, idempotencyKey: string, signal: AbortSignal) => Promise<SubmitResult>;

export const demoSubmitter: Submitter = async (_draft, _key, signal) => {
  try {
    await simulateRequest(signal);
    return { ok: true };
  } catch (e) {
    if (e instanceof SimulatedError) return { ok: false, message: "Error simulado de la demo. Tus datos siguen cargados.", retryable: true };
    throw e;
  }
};

export const liveSubmitter =
  (tenantId: string): Submitter =>
  async (draft, idempotencyKey) => {
    const res = await requestReservationAction({
      tenantId,
      serviceDate: draft.serviceDate ?? "",
      time: draft.time ?? "",
      guests: draft.guests,
      name: draft.name,
      phone: draft.phone,
      notes: draft.notes,
      idempotencyKey,
      email: draft.notify ? draft.email : undefined,
      notifyConsent: draft.notify === true,
    }).catch(() => ({ ok: false as const, code: "network" }));
    return res.ok ? { ok: true } : { ok: false, ...reservationErrorInfo(res.code) };
  };
