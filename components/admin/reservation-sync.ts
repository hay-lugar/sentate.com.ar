/**
 * Estado de sincronización de reservas en el panel. Sin React ni Supabase: reglas puras y testeables.
 *
 * - Una versión se marca como procesada solo cuando su lectura terminó bien (`beginFetch` no alcanza).
 * - Una respuesta vieja nunca pisa una más nueva: se compara `updated_at` de cada fila.
 * - Una resincronización conserva la copia local si es más nueva que la que devolvió la lectura.
 * - Si quien consume descarta una resincronización (p. ej. hay una escritura en curso), el almacén vuelve a su estado
 *   anterior con `snapshot`/`restore`: no puede dar por aplicado algo que la pantalla nunca recibió.
 */

export type Versioned = { id: string; updated_at: string };

/** Compara marcas de tiempo ISO por instante (no por texto: la precisión fraccionaria varía). */
export function isNewer(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a > b;
  return ta > tb;
}

export class ReservationSyncStore<T extends Versioned> {
  private latest = new Map<string, T>();
  private inFlight = new Map<string, string>();

  /** true si hay que leer la fila: no está aplicada ni se está leyendo una versión igual o más nueva. */
  needsFetch(id: string, version: string): boolean {
    const applied = this.latest.get(id)?.updated_at;
    if (applied !== undefined && !isNewer(version, applied)) return false;
    const pending = this.inFlight.get(id);
    if (pending !== undefined && !isNewer(version, pending)) return false;
    return true;
  }

  beginFetch(id: string, version: string): void {
    this.inFlight.set(id, version);
  }

  /** Libera la marca de lectura en curso. Solo la última versión pedida sigue en vuelo. */
  endFetch(id: string, version: string): void {
    if (this.inFlight.get(id) === version) this.inFlight.delete(id);
  }

  /** Aplica una fila leída si es más nueva que la que ya hay. */
  apply(row: T): { applied: boolean; isNew: boolean } {
    const current = this.latest.get(row.id);
    if (current && !isNewer(row.updated_at, current.updated_at)) return { applied: false, isNew: false };
    this.latest.set(row.id, row);
    return { applied: true, isNew: current === undefined };
  }

  /** Reemplaza el conjunto con una lectura completa, sin retroceder filas ya más nuevas. */
  replaceAll(rows: T[]): T[] {
    const merged = new Map<string, T>();
    for (const row of rows) {
      const local = this.latest.get(row.id);
      merged.set(row.id, local && isNewer(local.updated_at, row.updated_at) ? local : row);
    }
    for (const [id, row] of merged) this.latest.set(id, row);
    return [...merged.values()];
  }

  /** Copia del estado aplicado, para deshacer una resincronización que el consumidor descartó. */
  snapshot(): Map<string, T> {
    return new Map(this.latest);
  }

  restore(snapshot: Map<string, T>): void {
    this.latest = new Map(snapshot);
  }

  reset(): void {
    this.latest.clear();
    this.inFlight.clear();
  }
}

/** Espera exponencial acotada para reintentar lecturas fallidas: 1s, 2s, 4s, 8s, 16s, 30s… */
export function retryDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

export const MAX_RESYNC_ATTEMPTS = 6;
