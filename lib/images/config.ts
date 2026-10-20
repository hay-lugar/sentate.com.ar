/** Bucket privado de Supabase Storage para logo, portada y fotos de platos (ver migración 20261022000100). */
export const IMAGE_BUCKET = "tenant-images";

export type ImageKind = "logo" | "cover" | "dish";
export const IMAGE_KINDS = ["logo", "cover", "dish"] as const satisfies readonly ImageKind[];

/** Formatos aceptados al elegir un archivo. SVG, GIF y otros formatos activos o animados se rechazan. */
export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPT_ATTR = ACCEPTED_MIME.join(",");

export const IMAGE_LIMITS = {
  /** Foto de celular sin procesar. Se achica en el navegador antes de subir. */
  maxSourceBytes: 15 * 1024 * 1024,
  /** Tope de píxeles de origen: evita que una imagen enorme agote la memoria al decodificarla. */
  maxSourcePixels: 50_000_000,
  /** Igual al file_size_limit del bucket. */
  maxOutputBytes: 2 * 1024 * 1024,
  outputQuality: 0.82,
  /** Vigencia de las URLs firmadas de lectura. */
  signedUrlSeconds: 3600,
} as const;

type KindSpec = {
  label: string;
  /** Dimensiones mínimas del archivo de origen. */
  minWidth: number;
  minHeight: number;
  /** Lado mayor del archivo que se sube (nunca se agranda). */
  maxSide: number;
};

export const KIND_SPECS: Record<ImageKind, KindSpec> = {
  logo: { label: "Logo", minWidth: 128, minHeight: 128, maxSide: 512 },
  cover: { label: "Portada", minWidth: 640, minHeight: 320, maxSide: 1600 },
  dish: { label: "Foto del plato", minWidth: 320, minHeight: 320, maxSide: 1200 },
};

export const bytesToMb = (bytes: number) => Math.round(bytes / (1024 * 1024));
