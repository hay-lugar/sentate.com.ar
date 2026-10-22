/** Fecha y hora en horario argentino, o «—». */
export const fmt = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(iso)) : "—";

export const SUB_LABEL: Record<string, string> = { trialing: "en prueba", active: "activa", past_due: "en mora", canceled: "cancelada" };

export const ACTION_LABEL: Record<string, string> = {
  submit_for_review: "Envió a revisión", review_approve: "Aprobó", review_reject: "Rechazó", review_request_changes: "Pidió correcciones",
  suspend: "Pausó (suspendió)", reactivate: "Reactivó", subscription_extend_trial: "Extendió la prueba", subscription_activate: "Activó la suscripción",
  subscription_mark_past_due: "Marcó en mora", subscription_cancel: "Canceló la suscripción", featured_set: "Destacó", featured_clear: "Quitó el destacado",
  tenant_created: "Creó el comercio", tenant_deleted: "Eliminó el comercio", promotion_set: "Puso una promoción", promotion_clear: "Quitó la promoción",
  admin_added: "Agregó un administrador", admin_removed: "Quitó un administrador", setting_changed: "Cambió un ajuste",
};
