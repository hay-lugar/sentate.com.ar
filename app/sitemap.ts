import type { MetadataRoute } from "next";
import { cookies } from "next/headers";
import { appOrigin } from "@/lib/auth/app-url";
import { isSupabaseConfigured } from "@/utils/supabase/env";
import { createClient } from "@/utils/supabase/server";

// Solo se publican en el sitemap las fichas LISTADAS (aprobadas, con ubicación y acceso vigente), obtenidas por la misma
// regla de visibilidad del explorador. Nunca demos, borradores, rechazados, suspendidos ni páginas privadas.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let origin: string;
  try {
    origin = appOrigin();
  } catch {
    return [];
  }
  const entries: MetadataRoute.Sitemap = [
    { url: origin, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/explorar`, changeFrequency: "daily", priority: 0.8 },
  ];
  if (!isSupabaseConfigured()) return entries;
  try {
    const supabase = createClient(await cookies());
    const { data } = await supabase.rpc("explore_search", { p: { limit: 500, offset: 0, sort: "name" } });
    for (const item of ((data as { items?: { slug: string }[] } | null)?.items ?? [])) {
      entries.push({ url: `${origin}/${item.slug}`, changeFrequency: "weekly", priority: 0.6 });
    }
  } catch {
    // Sin base disponible el sitemap queda con lo estático: no rompe el sitio.
  }
  return entries;
}
