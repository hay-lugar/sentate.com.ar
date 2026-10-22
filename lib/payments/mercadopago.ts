import { createHmac, timingSafeEqual } from "node:crypto";

/** Tolerancia entre la marca de tiempo de la firma y el reloj del servidor: frena la repetición de notificaciones viejas. */
export const SIGNATURE_TOLERANCE_MS = 10 * 60 * 1000;

export type SignatureInput = {
  secret: string;
  /** Cabecera `x-signature`: `ts=<ms>,v1=<hex>`. */
  signature: string | null;
  /** Cabecera `x-request-id`. */
  requestId: string | null;
  /** `data.id` de la notificación (parámetro de la URL). */
  dataId: string | null;
  nowMs?: number;
};

export type SignatureResult = { ok: true; ts: string } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

/**
 * Verifica la firma de un webhook de Mercado Pago. El manifiesto firmado es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * (el id en minúsculas si es alfanumérico; las partes ausentes se omiten) con HMAC-SHA256 y el secreto del webhook.
 */
export function verifyMercadoPagoSignature(input: SignatureInput): SignatureResult {
  if (!input.secret || !input.signature) return { ok: false, reason: "missing" };
  const parts = Object.fromEntries(
    input.signature.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^\d{10,16}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return { ok: false, reason: "malformed" };

  const tsMs = ts.length <= 10 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs((input.nowMs ?? Date.now()) - tsMs) > SIGNATURE_TOLERANCE_MS) return { ok: false, reason: "stale" };

  const id = input.dataId && /^[a-z0-9]+$/i.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId;
  const manifest = `${id ? `id:${id};` : ""}${input.requestId ? `request-id:${input.requestId};` : ""}ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest();
  const given = Buffer.from(v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected) ? { ok: true, ts } : { ok: false, reason: "mismatch" };
}
