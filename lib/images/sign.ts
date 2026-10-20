import type { createClient } from "@/utils/supabase/server";
import { IMAGE_BUCKET, IMAGE_LIMITS } from "./config";
import { isImagePath } from "./paths";

type Client = ReturnType<typeof createClient>;

/**
 * Firma URLs de lectura para rutas del bucket privado. Lo hace el servidor con la sesión del visitante (anónima en la
 * carta pública): RLS en storage.objects decide qué rutas puede firmar, así que solo salen las imágenes de la carta
 * visible. Si algo falla, la carta se muestra sin esas imágenes: nunca rompe la página.
 */
export async function signImagePaths(supabase: Client, values: ReadonlyArray<string | null | undefined>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const paths = [...new Set(values.filter(isImagePath))];
  if (!paths.length) return out;
  const { data, error } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(paths, IMAGE_LIMITS.signedUrlSeconds);
  if (error || !data) return out;
  for (const item of data) if (item.path && item.signedUrl && !item.error) out.set(item.path, item.signedUrl);
  return out;
}

/** Ruta de Storage → URL firmada (o null si no se pudo firmar). Una URL https (demos) pasa tal cual. */
export function resolveImageRef(signed: ReadonlyMap<string, string>, value: string | null | undefined): string | null {
  if (!value) return null;
  return isImagePath(value) ? (signed.get(value) ?? null) : value;
}
