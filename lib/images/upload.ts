"use client";

import { createClient } from "@/utils/supabase/client";
import { getSupabaseEnv } from "@/utils/supabase/env";
import { IMAGE_BUCKET } from "./config";
import { ImageError } from "./prepare";

type Options = { signal?: AbortSignal; onProgress?: (percent: number) => void };

/** Mensaje para el dueño según la respuesta de Storage (que a veces informa el código real dentro del cuerpo). */
function uploadFailure(httpStatus: number, body: string): ImageError {
  let status = httpStatus;
  try {
    const parsed = JSON.parse(body) as { statusCode?: string | number };
    if (parsed.statusCode !== undefined) status = Number(parsed.statusCode) || httpStatus;
  } catch {
    // cuerpo no JSON: vale el estado HTTP
  }
  if (status === 401) return new ImageError("Tu sesión venció. Volvé a ingresar para subir imágenes.");
  if (status === 403) return new ImageError("No tenés permiso para subir imágenes (¿terminó tu período de prueba?).");
  if (status === 413) return new ImageError("La imagen supera el límite de 2 MB.");
  if (status === 415) return new ImageError("Ese formato de imagen no está permitido.");
  return new ImageError("No pudimos subir la imagen. Probá de nuevo.");
}

/**
 * Sube una imagen ya optimizada al bucket con la SESIÓN del dueño (la autorización la decide RLS en storage.objects).
 * Usa XMLHttpRequest porque fetch no informa el progreso de subida. Nunca usa service_role.
 * `x-upsert: false`: no pisa un objeto existente (cada subida lleva una ruta nueva).
 */
export async function uploadImage(path: string, image: { blob: Blob; contentType: string }, options: Options = {}): Promise<void> {
  const { url, key } = getSupabaseEnv();
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ImageError("Tu sesión venció. Volvé a ingresar para subir imágenes.");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${url}/storage/v1/object/${IMAGE_BUCKET}/${path}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("x-upsert", "false");

    // Mismo cuerpo que arma supabase-js: multipart con el archivo en un campo sin nombre.
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([image.blob], { type: image.contentType }));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(100);
        resolve();
      } else {
        reject(uploadFailure(xhr.status, xhr.responseText));
      }
    };
    xhr.onerror = () => reject(new ImageError("Sin conexión. Revisá tu internet y reintentá."));
    xhr.ontimeout = () => reject(new ImageError("La subida tardó demasiado. Reintentá."));
    xhr.onabort = () => reject(new ImageError("Subida cancelada."));
    xhr.timeout = 60_000;
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
