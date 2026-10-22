// Proveedores de correo. La aplicación NO depende de ninguno: sin configuración explícita el despachador no envía nada y las
// reservas funcionan igual. Un mensaje solo se considera enviado cuando el proveedor lo confirma.

export type OutgoingEmail = { to: string; subject: string; text: string; html: string; idempotencyKey: string };
export type SendResult = { ok: true; providerId: string } | { ok: false; retryable: boolean; error: string };

export interface EmailProvider {
  readonly name: string;
  send(message: OutgoingEmail): Promise<SendResult>;
}

type Env = Record<string, string | undefined>;

export type ProviderConfig = { enabled: false; reason: string } | { enabled: true; provider: EmailProvider };

/** Resend (https://resend.com): API HTTP simple. Se habilita con NOTIFICATIONS_PROVIDER=resend + RESEND_API_KEY + NOTIFICATIONS_FROM. */
export function resendProvider(apiKey: string, from: string, fetcher: typeof fetch = fetch): EmailProvider {
  return {
    name: "resend",
    async send(m) {
      try {
        const res = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
          body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { id?: string };
          return body.id ? { ok: true, providerId: body.id } : { ok: false, retryable: true, error: "respuesta sin id" };
        }
        // 429 y 5xx: reintentar. 4xx (dirección o contenido inválido): definitivo.
        return { ok: false, retryable: res.status === 429 || res.status >= 500, error: `http_${res.status}` };
      } catch (e) {
        return { ok: false, retryable: true, error: (e as Error).name === "TimeoutError" ? "timeout" : "red" };
      }
    },
  };
}

export function readProviderConfig(env: Env = process.env): ProviderConfig {
  const name = env.NOTIFICATIONS_PROVIDER?.trim().toLowerCase();
  if (!name || name === "off") return { enabled: false, reason: "NOTIFICATIONS_PROVIDER no está configurado (los avisos no se envían)." };
  if (name === "resend") {
    const key = env.RESEND_API_KEY;
    const from = env.NOTIFICATIONS_FROM;
    if (!key || !from) return { enabled: false, reason: "Falta RESEND_API_KEY o NOTIFICATIONS_FROM." };
    return { enabled: true, provider: resendProvider(key, from) };
  }
  return { enabled: false, reason: "Proveedor de avisos desconocido." };
}

/** ¿Se puede ofrecer el email en el formulario de reserva? Solo si de verdad se van a enviar avisos. */
export const notificationsAvailable = (env: Env = process.env) => readProviderConfig(env).enabled && !!env.NOTIFICATIONS_WORKER_SECRET;
