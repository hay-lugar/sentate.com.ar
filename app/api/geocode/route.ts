import { NextResponse } from "next/server";
import { inArgentina } from "@/lib/explorer/profile";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

// Geocodificación para el editor de ubicación (Geoapify, plan gratuito: 3000 créditos/día, 5 req/s).
// Solo con sesión iniciada, entrada acotada y sin guardar resultados: lo único que se persiste es lo que el dueño confirma.
// Sin GEOAPIFY_API_KEY responde 501 y la interfaz oculta la búsqueda (el pin se coloca a mano).
export const dynamic = "force-dynamic";

const recent = new Map<string, number[]>();
/** Tope por usuario en esta instancia (best-effort): 10 búsquedas por minuto. El límite duro es la cuota del proveedor. */
function throttled(userId: string) {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 10) {
    recent.set(userId, hits);
    return true;
  }
  recent.set(userId, [...hits, now]);
  if (recent.size > 5000) recent.clear();
  return false;
}

export async function GET(request: Request) {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 501 });

  const supabase = createClient(await cookies());
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (throttled(userId)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const text = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (text.length < 4 || text.length > 160) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", text);
  url.searchParams.set("filter", "countrycode:ar");
  url.searchParams.set("lang", "es");
  url.searchParams.set("limit", "5");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", key);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: "provider_error" }, { status: 502 });
    const body = (await res.json()) as { results?: Array<{ formatted?: string; lat?: number; lon?: number; city?: string; suburb?: string; state?: string }> };
    const results = (body.results ?? [])
      .filter((r) => typeof r.lat === "number" && typeof r.lon === "number" && inArgentina(r.lat, r.lon))
      .map((r) => ({ label: String(r.formatted ?? "").slice(0, 200), lat: r.lat as number, lng: r.lon as number, locality: r.city ?? "", neighborhood: r.suburb ?? "", state: r.state ?? "" }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "provider_error" }, { status: 502 });
  }
}
