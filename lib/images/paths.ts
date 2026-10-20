import { IMAGE_KINDS, type ImageKind } from "./config";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** <tenant_id>/<logo|cover|dish>/<uuid>.<webp|jpg>. Misma forma que private.image_tenant_id en la base. */
export const IMAGE_PATH_RE = new RegExp(`^(${UUID})/(${IMAGE_KINDS.join("|")})/(${UUID})\\.(webp|jpg)$`);

export type ImageExt = "webp" | "jpg";
export type ParsedImagePath = { tenantId: string; kind: ImageKind; id: string; ext: ImageExt };

export function parseImagePath(value: unknown): ParsedImagePath | null {
  if (typeof value !== "string") return null;
  const m = IMAGE_PATH_RE.exec(value);
  return m ? { tenantId: m[1], kind: m[2] as ImageKind, id: m[3], ext: m[4] as ImageExt } : null;
}

export const isImagePath = (value: unknown): value is string => parseImagePath(value) !== null;

/** Ruta nueva con un UUID aleatorio: dos subidas nunca colisionan ni se pisan. */
export function buildImagePath(tenantId: string, kind: ImageKind, ext: ImageExt, id: string = crypto.randomUUID()): string {
  const path = `${tenantId.toLowerCase()}/${kind}/${id.toLowerCase()}.${ext}`;
  if (!isImagePath(path)) throw new Error("ruta de imagen inválida");
  return path;
}

/**
 * Valida una referencia a imagen antes de guardarla: una ruta de Storage debe ser del MISMO comercio y del tipo
 * de la columna; una URL https (demos) se acepta tal cual. Devuelve el motivo del rechazo, o null.
 */
export function imageRefProblem(value: string | null | undefined, tenantId: string, kind: ImageKind): string | null {
  if (!value || /^https:\/\//.test(value)) return null;
  const parsed = parseImagePath(value);
  if (!parsed) return "La imagen no es válida.";
  if (parsed.tenantId !== tenantId.toLowerCase()) return "La imagen pertenece a otro comercio.";
  if (parsed.kind !== kind) return "La imagen no corresponde a este campo.";
  return null;
}
