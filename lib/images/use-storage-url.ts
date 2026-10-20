"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { IMAGE_BUCKET, IMAGE_LIMITS } from "./config";
import { isImagePath } from "./paths";

const cache = new Map<string, { url: string; expiresAt: number }>();
const MARGIN_MS = 60_000;

/** URL firmada vigente en el caché, o undefined si no hay o está por vencer. */
function freshFromCache(path: string): string | undefined {
  const hit = cache.get(path);
  return hit && hit.expiresAt > Date.now() ? hit.url : undefined;
}

/**
 * URL para mostrar una imagen en el PANEL. Una URL https pasa igual; una ruta de Storage se firma desde el navegador
 * con la sesión del dueño (los miembros pueden leer las imágenes de su comercio). Devuelve undefined mientras carga.
 */
export function useStorageUrl(value?: string | null): string | undefined {
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  const fresh = value && isImagePath(value) ? freshFromCache(value) : undefined;

  useEffect(() => {
    if (!value || !isImagePath(value) || fresh) return;
    let cancelled = false;
    void createClient()
      .storage.from(IMAGE_BUCKET)
      .createSignedUrl(value, IMAGE_LIMITS.signedUrlSeconds)
      .then(({ data }) => {
        if (cancelled || !data?.signedUrl) return;
        cache.set(value, { url: data.signedUrl, expiresAt: Date.now() + IMAGE_LIMITS.signedUrlSeconds * 1000 - MARGIN_MS });
        setSigned({ path: value, url: data.signedUrl });
      });
    return () => {
      cancelled = true;
    };
  }, [value, fresh]);

  if (!value) return undefined;
  if (!isImagePath(value)) return value;
  if (fresh) return fresh;
  return signed?.path === value ? signed.url : undefined;
}
