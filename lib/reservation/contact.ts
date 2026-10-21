import type { ReservationStatus } from "@/lib/domain/types";

/**
 * Contacto MANUAL con quien pidió la mesa. Sentate no envía mensajes: arma un enlace que abre WhatsApp con un texto
 * ya escrito y es el dueño quien decide enviarlo. El teléfono lo escribió el comensal y NO está verificado.
 *
 * El enlace solo se arma cuando el número es inequívoco. Un número mal armado escribiría a un desconocido, así que ante
 * la duda no hay enlace (queda el teléfono visible y "Llamar").
 */
export type WhatsAppTarget = {
  /** Número internacional sin "+" (lo que espera wa.me). */
  digits: string;
  /** Cómo se lo muestra al dueño, para que verifique a quién va a escribir. */
  display: string;
  /** El comensal no escribió el país y se asumió Argentina (+54 9). */
  assumedCountry: boolean;
};

const between = (n: number, min: number, max: number) => n >= min && n <= max;

function target(digits: string, assumedCountry: boolean): WhatsAppTarget {
  const display = digits.startsWith("549") ? `+54 9 ${digits.slice(3)}` : `+${digits}`;
  return { digits, display, assumedCountry };
}

export function whatsappTarget(rawPhone: string): WhatsAppTarget | null {
  const raw = rawPhone.trim();
  const digits = raw.replace(/\D/g, "");
  if (!between(digits.length, 8, 15)) return null;

  // "+" explícito: ya es internacional.
  if (raw.startsWith("+")) return target(digits, false);

  // Prefijo de discado internacional "00".
  if (digits.startsWith("00")) {
    const international = digits.slice(2);
    return between(international.length, 8, 15) ? target(international, false) : null;
  }

  // Argentina escrita con 54 pero sin "+": 54 9 + 10 dígitos, o 54 + 10 dígitos (se agrega el 9 de celulares).
  if (digits.startsWith("549") && digits.length === 13) return target(digits, false);
  if (digits.startsWith("54") && digits.length === 12) return target(`549${digits.slice(2)}`, false);

  // Argentina local: código de área + número = 10 dígitos, con o sin el 0 de discado nacional.
  let national = digits;
  if (national.length === 11 && national.startsWith("0")) national = national.slice(1);
  if (national.length === 10 && !national.startsWith("0")) return target(`549${national}`, true);

  // Con el "15" de los celulares, de otros países sin "+", o con un largo raro: no se adivina.
  return null;
}

export const whatsappLink = (t: WhatsAppTarget, text: string) => `https://wa.me/${t.digits}?text=${encodeURIComponent(text)}`;

/** Enlace `tel:` con el número tal cual lo escribió el comensal (solo dígitos y "+"). */
export const telLink = (rawPhone: string) => `tel:${rawPhone.replace(/[^\d+]/g, "")}`;

/** "Hoy" y "Mañana" van sin artículo; una fecha va con "el". */
export function dayPhrase(dayLabel: string): string {
  const label = dayLabel.trim();
  return /^(hoy|mañana)$/i.test(label) ? label.toLowerCase() : `el ${label}`;
}

export type ContactContext = {
  status: ReservationStatus;
  name: string;
  tenantName: string;
  guests: number;
  dayLabel: string;
  time: string;
};

/**
 * Texto inicial del mensaje, según el estado. Es solo una propuesta: el dueño lo ve y lo edita en WhatsApp antes de
 * enviarlo. Ningún texto afirma que algo ya se envió ni promete una mesa que no esté confirmada.
 */
export function contactMessage(c: ContactContext): string {
  const first = c.name.trim().split(/\s+/)[0] || c.name.trim();
  const people = `${c.guests} ${c.guests === 1 ? "persona" : "personas"}`;
  const slot = `${people} ${dayPhrase(c.dayLabel)} a las ${c.time}`;
  const intro = `Hola ${first}, te escribimos de ${c.tenantName}.`;
  switch (c.status) {
    case "pending":
      return `${intro} Recibimos tu solicitud de mesa para ${slot}. La estamos revisando y te avisamos por este medio si podemos recibirte.`;
    case "confirmed":
      return `${intro} Tu mesa para ${slot} está confirmada. ¡Te esperamos!`;
    case "rejected":
      return `${intro} No podemos confirmar tu solicitud de mesa para ${slot}. ¿Querés que veamos otro día u horario?`;
    case "cancelled":
      return `${intro} Tu reserva para ${slot} figura como cancelada. Si querés, buscamos otro día u horario.`;
    case "expired":
      return `${intro} No llegamos a responder tu solicitud de mesa para ${slot}. Si querés, buscamos otro día u horario.`;
    case "finished":
      return `${intro} ¡Gracias por visitarnos! Esperamos verte de nuevo.`;
  }
}
