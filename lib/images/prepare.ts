"use client";

import { IMAGE_LIMITS, KIND_SPECS, type ImageKind } from "./config";
import type { ImageExt } from "./paths";
import { fitWithin, validateDimensions, validateSource } from "./validate";

export class ImageError extends Error {}

export type PreparedImage = { blob: Blob; width: number; height: number; contentType: string; ext: ImageExt };

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Valida y optimiza una imagen elegida desde el celular o la computadora:
 *  1. Revisa el contenido real (no la extensión) y el tamaño.
 *  2. La decodifica respetando la orientación EXIF (las fotos del celular suelen venir "acostadas").
 *  3. Revisa las dimensiones y la achica al tope del tipo de imagen, sin agrandarla.
 *  4. La vuelve a codificar (WebP; JPEG si el navegador no codifica WebP). Re-codificar descarta los metadatos EXIF,
 *     incluida la ubicación GPS.
 */
export async function prepareImage(file: File, kind: ImageKind): Promise<PreparedImage> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const sourceProblem = validateSource({ size: file.size, head });
  if (sourceProblem) throw new ImageError(sourceProblem);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("No pudimos leer la imagen. Probá con otra.");
  }

  try {
    const dimsProblem = validateDimensions(kind, bitmap.width, bitmap.height);
    if (dimsProblem) throw new ImageError(dimsProblem);

    const { width, height } = fitWithin(bitmap.width, bitmap.height, KIND_SPECS[kind].maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError("Tu navegador no puede procesar imágenes.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Prefiere WebP; si el navegador devuelve otro tipo, se usa JPEG (la ruta lleva la extensión real).
    let blob = await toBlob(canvas, "image/webp", IMAGE_LIMITS.outputQuality);
    let ext: ImageExt = "webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await toBlob(canvas, "image/jpeg", IMAGE_LIMITS.outputQuality);
      ext = "jpg";
    }
    if (!blob) throw new ImageError("No pudimos optimizar la imagen. Probá con otra.");

    // Si aún pesa de más, baja la calidad en pasos antes de rendirse.
    for (const quality of [0.7, 0.6, 0.5]) {
      if (blob.size <= IMAGE_LIMITS.maxOutputBytes) break;
      const retry = await toBlob(canvas, blob.type, quality);
      if (retry) blob = retry;
    }
    if (blob.size > IMAGE_LIMITS.maxOutputBytes) throw new ImageError("La imagen sigue siendo muy pesada. Elegí una más simple.");

    return { blob, width, height, contentType: blob.type, ext };
  } finally {
    bitmap.close();
  }
}
