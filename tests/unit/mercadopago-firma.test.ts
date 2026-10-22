import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SIGNATURE_TOLERANCE_MS, verifyMercadoPagoSignature } from "@/lib/payments/mercadopago";

const secret = "secreto-de-prueba-del-webhook";
const nowMs = 1_800_000_000_000;
const sign = (manifest: string) => createHmac("sha256", secret).update(manifest).digest("hex");

describe("firma de webhooks de Mercado Pago", () => {
  const ts = String(nowMs);
  const base = { secret, requestId: "req-1", dataId: "ABC123", nowMs };

  it("acepta una firma válida (id en minúsculas)", () => {
    const signature = `ts=${ts},v1=${sign(`id:abc123;request-id:req-1;ts:${ts};`)}`;
    expect(verifyMercadoPagoSignature({ ...base, signature })).toEqual({ ok: true, ts });
  });

  it("rechaza una firma alterada o de otro secreto", () => {
    const signature = `ts=${ts},v1=${sign(`id:otro;request-id:req-1;ts:${ts};`)}`;
    expect(verifyMercadoPagoSignature({ ...base, signature })).toEqual({ ok: false, reason: "mismatch" });
    const forged = `ts=${ts},v1=${createHmac("sha256", "otro").update(`id:abc123;request-id:req-1;ts:${ts};`).digest("hex")}`;
    expect(verifyMercadoPagoSignature({ ...base, signature: forged }).ok).toBe(false);
  });

  it("rechaza notificaciones viejas aunque la firma sea correcta", () => {
    const old = String(nowMs - SIGNATURE_TOLERANCE_MS - 1000);
    const signature = `ts=${old},v1=${sign(`id:abc123;request-id:req-1;ts:${old};`)}`;
    expect(verifyMercadoPagoSignature({ ...base, signature })).toEqual({ ok: false, reason: "stale" });
  });

  it("rechaza cabeceras ausentes o mal formadas", () => {
    expect(verifyMercadoPagoSignature({ ...base, signature: null })).toEqual({ ok: false, reason: "missing" });
    expect(verifyMercadoPagoSignature({ ...base, secret: "", signature: "ts=1,v1=x" })).toEqual({ ok: false, reason: "missing" });
    expect(verifyMercadoPagoSignature({ ...base, signature: "basura" })).toEqual({ ok: false, reason: "malformed" });
    expect(verifyMercadoPagoSignature({ ...base, signature: `ts=${ts},v1=zz` })).toEqual({ ok: false, reason: "malformed" });
  });

  it("omite las partes ausentes del manifiesto", () => {
    const signature = `ts=${ts},v1=${sign(`ts:${ts};`)}`;
    expect(verifyMercadoPagoSignature({ secret, signature, requestId: null, dataId: null, nowMs }).ok).toBe(true);
  });
});
