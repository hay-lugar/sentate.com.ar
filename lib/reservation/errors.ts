// Traducción de los códigos estables de public.request_reservation a mensajes de UI.
// Puro y testeable. `field` indica a qué paso volver para corregir.

import type { ReservationField } from "./validation";

export type ReservationErrorInfo = { field?: ReservationField; message: string; retryable: boolean };

const MAP: Record<string, ReservationErrorInfo> = {
  invalid_guests: { field: "guests", message: "Esa cantidad de personas no está disponible. Para grupos más grandes, llamá al local.", retryable: false },
  invalid_name: { field: "name", message: "Revisá tu nombre.", retryable: false },
  invalid_phone: { field: "phone", message: "Revisá el teléfono (8 a 15 dígitos).", retryable: false },
  invalid_notes: { field: "notes", message: "El comentario es demasiado largo.", retryable: false },
  invalid_slot: { field: "time", message: "Ese horario no es válido. Elegí otro.", retryable: false },
  outside_opening_hours: { field: "time", message: "Ese horario está fuera de la atención del local.", retryable: false },
  slot_too_soon: { field: "time", message: "Ese horario ya pasó o está muy cerca. Elegí otro.", retryable: false },
  date_out_of_range: { field: "serviceDate", message: "Esa fecha está fuera del período de reservas.", retryable: false },
  tenant_closed: { field: "serviceDate", message: "El local está cerrado ese día.", retryable: false },
  slot_full: { field: "time", message: "Ese horario se completó. Elegí otro.", retryable: false },
  slot_blocked: { field: "time", message: "El local no recibe reservas en ese horario. Elegí otro.", retryable: false },
  reservations_closed: { message: "Este local no está recibiendo reservas por la web en este momento. Llamá al local.", retryable: false },
  tenant_unavailable: { message: "Este local no está recibiendo solicitudes de mesa en este momento.", retryable: false },
  too_many_pending: {
    message: "Ya tenés varias solicitudes pendientes en este local. Esperá a que las confirmen.",
    retryable: false,
  },
  rate_limited: { message: "El local recibió muchas solicitudes. Probá de nuevo en unos minutos.", retryable: true },
  ip_rate_limited: {
    message: "Hiciste muchas solicitudes en poco tiempo desde esta conexión. Esperá unos minutos y probá de nuevo, o llamá al local.",
    retryable: true,
  },
  service_unavailable: {
    message: "Por ahora no podemos recibir solicitudes desde la web. Probá más tarde o llamá al local.",
    retryable: true,
  },
  idempotency_key_reused: { message: "La solicitud cambió mientras se enviaba. Volvé a intentar.", retryable: true },
};

const GENERIC: ReservationErrorInfo = {
  message: "No pudimos enviar la solicitud. Revisá tu conexión e intentá de nuevo.",
  retryable: true,
};

export function reservationErrorInfo(code: string | undefined): ReservationErrorInfo {
  return (code && MAP[code]) || GENERIC;
}
