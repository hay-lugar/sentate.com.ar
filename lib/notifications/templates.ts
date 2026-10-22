// Plantillas de avisos de reserva (es-AR). Puras y testeables. Solo usan los datos mínimos del payload del outbox:
// nunca teléfono ni email del comensal. Un aviso de «solicitud recibida» NO dice que la mesa está confirmada.

export type NotificationKind = "reservation_received" | "reservation_confirmed" | "reservation_rejected" | "reservation_cancelled";

export type NotificationPayload = {
  tenant_name: string;
  tenant_phone?: string;
  tenant_slug?: string;
  timezone: string;
  starts_at: string;
  guests: number;
  first_name: string;
};

export type RenderedMessage = { subject: string; text: string; html: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function when(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone }).format(d);
  const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(d);
  return `${date} a las ${time} h`;
}

export function renderNotification(kind: NotificationKind, p: NotificationPayload, brandName: string): RenderedMessage {
  const slot = `${p.guests} ${p.guests === 1 ? "persona" : "personas"}, ${when(p.starts_at, p.timezone)}`;
  const hello = `Hola ${p.first_name || ""}`.trim() + ",";
  const call = p.tenant_phone ? ` Si necesitás hablar con el local: ${p.tenant_phone}.` : "";
  const bodies: Record<NotificationKind, { subject: string; lines: string[] }> = {
    reservation_received: {
      subject: `Recibimos tu solicitud en ${p.tenant_name}`,
      lines: [
        `${p.tenant_name} recibió tu solicitud de mesa para ${slot}.`,
        "Todavía NO es una reserva confirmada: el local la revisa y te avisamos cuando responda.",
      ],
    },
    reservation_confirmed: {
      subject: `Tu reserva en ${p.tenant_name} está confirmada`,
      lines: [`${p.tenant_name} confirmó tu mesa para ${slot}.`, `Te esperan.${call}`],
    },
    reservation_rejected: {
      subject: `${p.tenant_name} no pudo aceptar tu solicitud`,
      lines: [`${p.tenant_name} no pudo aceptar tu solicitud de mesa para ${slot}.`, `Podés pedir otro día u horario desde su carta.${call}`],
    },
    reservation_cancelled: {
      subject: `${p.tenant_name} canceló tu reserva`,
      lines: [`${p.tenant_name} canceló tu reserva para ${slot}.`, `Podés pedir otro día u horario desde su carta.${call}`],
    },
  };
  const { subject, lines } = bodies[kind];
  const footer = `Recibís este mensaje porque pediste avisos sobre esta solicitud en ${brandName}. No lo usamos para otra cosa.`;
  return {
    subject,
    text: [hello, "", ...lines, "", footer].join("\n"),
    html: `<p>${esc(hello)}</p>${lines.map((l) => `<p>${esc(l)}</p>`).join("")}<p style="color:#6e6e73;font-size:13px">${esc(footer)}</p>`,
  };
}
