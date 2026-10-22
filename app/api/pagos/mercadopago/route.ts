import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyMercadoPagoSignature } from "@/lib/payments/mercadopago";
import { redact } from "@/lib/log/redact";

// Webhook de Mercado Pago. HOY solo VERIFICA la firma y REGISTRA el evento de forma idempotente (record_payment_event).
// No activa suscripciones ni cobra: ver docs/pagos.md. Sin MERCADOPAGO_WEBHOOK_SECRET y PAYMENTS_WORKER_SECRET responde 503.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "";
  const workerSecret = process.env.PAYMENTS_WORKER_SECRET ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!webhookSecret || workerSecret.length < 32 || !url || !key) return NextResponse.json({ enabled: false }, { status: 503 });

  const search = new URL(request.url).searchParams;
  let body: { type?: unknown; topic?: unknown; action?: unknown; live_mode?: unknown; data?: { id?: unknown } } = {};
  try {
    body = await request.json();
  } catch {
    // Mercado Pago a veces envía solo parámetros en la URL.
  }
  const dataId = search.get("data.id") ?? (body.data?.id !== undefined ? String(body.data.id) : null);

  const verified = verifyMercadoPagoSignature({
    secret: webhookSecret,
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId: search.get("data.id") ?? dataId,
  });
  if (!verified.ok) return NextResponse.json({ error: "invalid_signature", reason: verified.reason }, { status: 401 });

  const kind = String(body.type ?? body.topic ?? search.get("type") ?? search.get("topic") ?? "unknown").slice(0, 80);
  const action = body.action ? String(body.action).slice(0, 80) : "";
  // Mismo evento reenviado = misma clave (la marca de tiempo firmada no cambia entre reintentos).
  const eventKey = `${kind}:${action}:${dataId ?? ""}:${verified.ts}`;

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("record_payment_event", {
    p_secret: workerSecret,
    p_provider: "mercadopago",
    p_event_key: eventKey,
    p_kind: kind,
    p_resource_id: dataId,
    // Solo lo mínimo: sin datos personales.
    p_payload: { type: kind, action, data_id: dataId, live_mode: body.live_mode === true },
  });
  if (error) {
    console.error("[sentate] webhook de pago", redact(error.message));
    // 5xx: el proveedor reintenta, y el registro es idempotente.
    return NextResponse.json({ error: "record_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, status: (data as { status: string }).status });
}
