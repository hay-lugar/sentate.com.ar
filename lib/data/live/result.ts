// Resultado explícito de una lectura: distingue "no existe", "sin permiso" y "falló".
// Nunca se convierte un error de red/base en una carta vacía o un 404.

export type LiveResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "error"; reason: string };

/** Falla temporal de datos (red, base, timeout). Lo atrapan los error boundaries con "Reintentar". */
export class TemporaryDataError extends Error {
  constructor(where: string) {
    super(`No pudimos cargar los datos (${where}). Probá de nuevo en unos segundos.`);
    this.name = "TemporaryDataError";
  }
}
