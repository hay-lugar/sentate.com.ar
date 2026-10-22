import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveImageRef, signImagePaths } from "@/lib/images/sign";
import { redact } from "@/lib/log/redact";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/env";

// Búsqueda pública del explorador. POST (no GET) para que la posición aproximada del visitante no quede en URLs de logs.
// No registra el cuerpo. La visibilidad la decide la base (public.explore_search → private.is_listed); acá solo se valida,
// se acota el ritmo y se firman las imágenes del Storage privado.
export const dynamic = "force-dynamic";

const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);
const body = z
  .object({
    q: z.string().max(80).optional(),
    locality_key: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
    province: slug.optional(),
    business_types: z.array(slug).max(10).optional(),
    cuisines: z.array(slug).max(10).optional(),
    price: z.array(z.enum(["$", "$$", "$$$"])).max(3).optional(),
    open_now: z.boolean().optional(),
    accepts_reservations: z.boolean().optional(),
    with_promotion: z.boolean().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    radius_km: z.number().min(0.1).max(500).optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    sort: z.enum(["relevance", "distance", "name"]).optional(),
    limit: z.number().int().min(1).max(300),
    offset: z.number().int().min(0).max(10000),
  })
  .strict()
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), "lat y lng van juntos");

// Tope best-effort por conexión en esta instancia (el abuso a escala lo frena la plataforma). 90 pedidos por minuto.
const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 90;
}

type Item = { id: string; cover_url: string | null; logo_url: string | null } & Record<string, unknown>;

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ total: 0, items: [], unavailable: true });
  const ip = (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for") ?? "anon").split(",")[0].trim();
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "30" } });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("explore_search", { p: parsed.data });
  if (error) {
    if (error.code === "P0001") return NextResponse.json({ error: "invalid" }, { status: 400 });
    console.error("[sentate] explorar", error.code, redact(error.message));
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const result = data as { total: number; items: Item[]; featured_items?: Item[] };
  const featured = result.featured_items ?? [];
  const signed = await signImagePaths(supabase, [...result.items, ...featured].flatMap((i) => [i.cover_url, i.logo_url]));
  // Promociones vigentes: la base (RLS) solo entrega las que están dentro de su ventana y de comercios visibles.
  // Si la lectura falla, el explorador funciona igual, sin promociones.
  const ids = [...new Set([...result.items, ...featured].map((i) => i.id as string))];
  const promos = new Map<string, { title: string; detail: string }>();
  if (ids.length) {
    const { data: rows } = await supabase.from("tenant_promotions").select("tenant_id, title, detail").in("tenant_id", ids);
    for (const p of rows ?? []) promos.set(p.tenant_id as string, { title: p.title as string, detail: (p.detail as string) ?? "" });
  }
  const sign = (i: Item) => {
    const promotion = promos.get(i.id as string);
    return { ...i, cover_url: resolveImageRef(signed, i.cover_url), logo_url: resolveImageRef(signed, i.logo_url), ...(promotion ? { promotion } : {}) };
  };
  return NextResponse.json({ total: result.total, items: result.items.map(sign), featured_items: featured.map(sign) }, { headers: { "Cache-Control": "no-store" } });
}
