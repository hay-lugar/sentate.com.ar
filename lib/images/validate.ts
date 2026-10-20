import { IMAGE_LIMITS, KIND_SPECS, bytesToMb, type ImageKind } from "./config";
import { isAllowedType, sniffImageType, type SniffedType } from "./sniff";

const TYPE_MESSAGES: Partial<Record<SniffedType, string>> = {
  svg: "Los SVG no se aceptan. Usá una foto JPG, PNG o WebP.",
  gif: "Los GIF no se aceptan. Usá una foto JPG, PNG o WebP.",
  heic: "Ese formato (HEIC) no se puede leer acá. Sacá la foto en JPG o elegí otra.",
};

/** Problema del archivo elegido según su tamaño y su contenido real (no su extensión), o null. */
export function validateSource(input: { size: number; head: Uint8Array }): string | null {
  if (input.size <= 0) return "El archivo está vacío.";
  if (input.size > IMAGE_LIMITS.maxSourceBytes) return `La imagen pesa más de ${bytesToMb(IMAGE_LIMITS.maxSourceBytes)} MB. Elegí una más liviana.`;
  const type = sniffImageType(input.head);
  if (!isAllowedType(type)) return TYPE_MESSAGES[type] ?? "El archivo no es una imagen JPG, PNG o WebP.";
  return null;
}

/** Problema de las dimensiones de origen según el tipo de imagen, o null. */
export function validateDimensions(kind: ImageKind, width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "No pudimos leer las dimensiones de la imagen.";
  if (width * height > IMAGE_LIMITS.maxSourcePixels) return "La imagen es demasiado grande (más de 50 megapíxeles).";
  const spec = KIND_SPECS[kind];
  if (width < spec.minWidth || height < spec.minHeight) {
    return `${spec.label}: la imagen es muy chica. Mínimo ${spec.minWidth}×${spec.minHeight} px.`;
  }
  return null;
}

/** Tamaño de salida: el lado mayor no supera `maxSide` y nunca se agranda. Mantiene la proporción. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Texto de límites para mostrar en la interfaz. */
export function limitsHint(kind: ImageKind): string {
  const spec = KIND_SPECS[kind];
  return `JPG, PNG o WebP · hasta ${bytesToMb(IMAGE_LIMITS.maxSourceBytes)} MB · mínimo ${spec.minWidth}×${spec.minHeight} px. Se optimiza antes de subir.`;
}
