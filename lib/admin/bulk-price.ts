// Cálculo y vista previa del cambio masivo de precios. Puro y testeable: la base vuelve a validar todo.

export const MAX_PRICE = 10_000_000;
export const MAX_BATCH = 500;

export type BulkOp = {
  kind: "percent" | "amount" | "set";
  value: number;
  /** Redondeo al múltiplo más cercano (0 = al peso entero). */
  rounding: 0 | 10 | 50 | 100;
};

export type BulkItem = { id: string; name: string; category: string; price: number; version: string };

export type PreviewRow = {
  id: string;
  name: string;
  category: string;
  oldPrice: number;
  newPrice: number;
  version: string;
  problem?: string;
};

export function opProblem(op: BulkOp): string | null {
  if (!Number.isFinite(op.value)) return "Ingresá un valor numérico.";
  if (op.kind === "percent" && (op.value < -90 || op.value > 500)) return "El porcentaje debe estar entre -90 % y 500 %.";
  if (op.kind === "amount" && Math.abs(op.value) > MAX_PRICE) return "El monto es demasiado grande.";
  if (op.kind === "set" && (op.value < 0 || op.value > MAX_PRICE)) return "El precio debe estar entre $0 y $10.000.000.";
  return null;
}

export function newPrice(old: number, op: BulkOp): number {
  const raw = op.kind === "percent" ? old * (1 + op.value / 100) : op.kind === "amount" ? old + op.value : op.value;
  const step = op.rounding || 1;
  return Math.round(raw / step) * step;
}

export type Preview = { rows: PreviewRow[]; changed: PreviewRow[]; unchanged: number; blocking: string | null };

/** Vista previa para los platos elegidos. Cualquier fila con problema bloquea la aplicación entera (todo o nada). */
export function previewBulk(items: BulkItem[], selected: ReadonlySet<string>, op: BulkOp): Preview {
  const opError = opProblem(op);
  const rows: PreviewRow[] = items
    .filter((i) => selected.has(i.id))
    .map((i) => {
      const next = opError ? i.price : newPrice(i.price, op);
      const problem = opError ? undefined : next < 0 ? "Quedaría con precio negativo." : next > MAX_PRICE ? "Supera el precio máximo." : undefined;
      return { id: i.id, name: i.name, category: i.category, oldPrice: i.price, newPrice: next, version: i.version, problem };
    });
  const changed = rows.filter((r) => r.newPrice !== r.oldPrice);
  const blocking =
    opError ??
    (rows.length === 0 ? "Elegí al menos un plato." : null) ??
    (rows.some((r) => r.problem) ? "Hay platos con problemas: corregí el valor o sacalos de la selección." : null) ??
    (changed.length > MAX_BATCH ? `Máximo ${MAX_BATCH} platos por operación.` : null) ??
    (changed.length === 0 ? "Con estos valores ningún precio cambia." : null);
  return { rows, changed, unchanged: rows.length - changed.length, blocking };
}
