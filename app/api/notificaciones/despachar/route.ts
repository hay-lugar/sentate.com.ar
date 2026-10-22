import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { BRAND } from "@/lib/config/brand";
import { dispatchOnce, type Claimed } from "@/lib/notifications/dispatch";
import { readProviderConfig } from "@/lib/notifications/provider";
import { redact } from "@/lib/log/redact";
import { createClient as createBrowserlessClient } from "@supabase/supabase-js";

// Despachador de avisos. Lo invoca un programador externo (p. ej. Vercel Cron o GitHub Actions) con
// `Authorization: Bearer <NOTIFICATIONS_WORKER_SECRET>`. Sin proveedor configurado NO hace nada. No usa claves privilegiadas:
// las RPC claim/complete validan el MISMO secreto contra su hash guardado en la base.
export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATIONS_WORKER_SECRET ?? "";
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret.length < 32 || !same(bearer, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const config = readProviderConfig();
  if (!config.enabled) return NextResponse.json({ enabled: false, reason: config.reason });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supabase = createBrowserlessClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const summary = await dispatchOnce({
      brandName: BRAND.name,
      provider: config.provider,
      claim: async (limit) => {
        const { data, error } = await supabase.rpc("claim_notifications", { p_secret: secret, p_limit: limit });
        if (error) throw new Error(error.code ?? "claim");
        return (data ?? []) as Claimed[];
      },
      complete: async (id, r) => {
        const { error } = await supabase.rpc("complete_notification", { p_secret: secret, p_id: id, p_ok: r.ok, p_provider_id: r.providerId ?? null, p_error: r.error ?? null, p_retryable: r.retryable ?? false });
        if (error) throw new Error(error.code ?? "complete");
      },
    });
    return NextResponse.json({ enabled: true, ...summary });
  } catch (e) {
    console.error("[sentate] despachador", redact((e as Error).message));
    return NextResponse.json({ error: "dispatch_failed" }, { status: 502 });
  }
}
