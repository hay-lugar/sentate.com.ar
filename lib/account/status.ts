export type DisplayStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "finished" | "expired";

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  finished: "Finalizada",
  expired: "Sin respuesta",
};

export const STATUS_HELP: Record<DisplayStatus, string> = {
  pending: "El local todavía no respondió tu solicitud.",
  confirmed: "El local confirmó tu mesa.",
  rejected: "El local no pudo aceptar tu solicitud.",
  cancelled: "Esta reserva fue cancelada.",
  finished: "Esta reserva ya pasó.",
  expired: "El local no respondió a tiempo y la fecha ya pasó.",
};

export type MyReservation = {
  id: string;
  status: string;
  display_status: DisplayStatus;
  starts_at: string;
  service_date: string;
  guests: number;
  notes: string;
  created_at: string;
  decided_at: string | null;
  can_cancel: boolean;
  cancel_cutoff_hours: number;
  tenant: { slug: string; name: string; address: string; phone: string; timezone: string; visible: boolean };
};

/** Fecha y hora en la zona del comercio (no la del dispositivo). */
export function formatWhen(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone }).format(d);
  const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(d);
  return `${date.charAt(0).toUpperCase()}${date.slice(1)}, ${time} h`;
}

export function cancelErrorMessage(code: string | undefined): string {
  switch (code) {
    case "cancel_too_late":
      return "Ya no se puede cancelar desde acá porque falta poco para la reserva. Comunicate con el local.";
    case "cannot_cancel":
      return "Esta reserva ya no se puede cancelar.";
    case "not_found":
      return "No encontramos esa reserva.";
    default:
      return "No pudimos cancelar. Probá de nuevo.";
  }
}
