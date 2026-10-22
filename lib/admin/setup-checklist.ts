// Lista de puesta en marcha del comercio: qué falta para estar publicado y visible. Pura y testeable.

import type { ModerationStatus } from "@/lib/explorer/profile";

export type ChecklistInput = {
  slug: string;
  /** Claves de public.tenant_profile_missing (business_type, address, phone, schedule, location). */
  missing: string[];
  dishCount: number;
  isPublished: boolean;
  moderation: ModerationStatus;
  suspended: boolean;
  acceptsReservations: boolean;
  capacityConfigured: boolean;
};

export type ChecklistItem = {
  id: string;
  title: string;
  /** Por qué se pide / qué pasa si falta. */
  why: string;
  done: boolean;
  href: string;
  cta: string;
  /** Opcional: no bloquea el listado ni la publicación. */
  optional?: boolean;
};

export function buildChecklist(i: ChecklistInput): ChecklistItem[] {
  const base = `/admin/${i.slug}`;
  const has = (k: string) => !i.missing.includes(k);
  const listedStep =
    i.moderation === "approved"
      ? { done: true, why: "Tu local ya aparece en el explorador mientras tu carta esté publicada." }
      : i.moderation === "pending_review"
        ? { done: false, why: "Estamos revisando tu local. Tu carta sigue funcionando mientras tanto." }
        : i.moderation === "changes_requested" || i.moderation === "rejected"
          ? { done: false, why: "Hay un motivo para corregir. Revisalo y volvé a enviar." }
          : { done: false, why: "Para aparecer en el explorador un equipo revisa tu local. Tu carta funciona igual sin esto." };
  return [
    { id: "datos", title: "Datos del local", why: "Teléfono y tipo de comercio para que te encuentren y te contacten.", done: has("business_type") && has("phone"), href: `${base}/ajustes`, cta: "Completar datos" },
    { id: "horarios", title: "Horarios de atención", why: "Se muestran en tu carta y calculan «abierto ahora» y las reservas.", done: has("schedule"), href: `${base}/ajustes`, cta: "Cargar horarios" },
    { id: "ubicacion", title: "Dirección y ubicación en el mapa", why: "Sin ubicación confirmada no aparecés en el mapa.", done: has("address") && has("location"), href: `${base}/explorador`, cta: "Ubicar en el mapa" },
    { id: "carta", title: "Carta con platos", why: "Es lo primero que ve quien escanea tu QR.", done: i.dishCount > 0, href: `${base}/menu`, cta: "Cargar la carta" },
    { id: "publicar", title: "Publicar la carta", why: "Mientras no la publiques, nadie puede verla.", done: i.isPublished, href: `${base}`, cta: "Publicar" },
    { id: "revision", title: i.suspended ? "Local suspendido" : "Aprobación para el explorador", ...listedStep, done: !i.suspended && listedStep.done, href: `${base}/explorador`, cta: "Ver estado" },
    {
      id: "reservas",
      title: i.acceptsReservations ? "Reservas: capacidad" : "Reservas desactivadas",
      why: i.acceptsReservations
        ? "Sin tope configurado se aceptan solicitudes sin límite de comensales. Definí tu capacidad para evitar sobreventa."
        : "Tu local solo muestra la carta. Podés activarlas cuando quieras.",
      done: !i.acceptsReservations || i.capacityConfigured,
      href: `${base}/reservas/capacidad`,
      cta: "Configurar reservas",
      optional: true,
    },
    { id: "qr", title: "Código QR", why: "Imprimilo para tus mesas y mostrador.", done: false, href: `${base}/qr`, cta: "Ver QR", optional: true },
  ];
}

export const requiredPending = (items: ChecklistItem[]) => items.filter((i) => !i.optional && !i.done);
