import { describe, expect, it } from "vitest";
import { newPrice, opProblem, previewBulk, type BulkItem, type BulkOp } from "@/lib/admin/bulk-price";

const items: BulkItem[] = [
  { id: "a", name: "Provoleta", category: "Entradas", price: 9800, version: "v1" },
  { id: "b", name: "Ojo de bife", category: "Parrilla", price: 26500, version: "v1" },
  { id: "c", name: "Agua", category: "Bebidas", price: 0, version: "v1" },
];
const op = (o: Partial<BulkOp>): BulkOp => ({ kind: "percent", value: 10, rounding: 0, ...o });

describe("cambio masivo de precios", () => {
  it("calcula porcentaje, monto y precio fijo con redondeo", () => {
    expect(newPrice(9800, op({ value: 10 }))).toBe(10780);
    expect(newPrice(9800, op({ value: 10, rounding: 100 }))).toBe(10800);
    expect(newPrice(9800, op({ kind: "amount", value: -300 }))).toBe(9500);
    expect(newPrice(9800, op({ kind: "set", value: 12000 }))).toBe(12000);
  });
  it("solo toca lo seleccionado y separa lo que no cambia", () => {
    const p = previewBulk(items, new Set(["a", "c"]), op({ value: 10 }));
    expect(p.rows.map((r) => r.id)).toEqual(["a", "c"]);
    expect(p.changed.map((r) => r.id)).toEqual(["a"]);
    expect(p.unchanged).toBe(1);
    expect(p.blocking).toBeNull();
  });
  it("bloquea todo si un plato quedaría negativo (todo o nada)", () => {
    const p = previewBulk(items, new Set(["a", "b"]), op({ kind: "amount", value: -10000 }));
    expect(p.rows.find((r) => r.id === "a")?.problem).toMatch(/negativo/);
    expect(p.blocking).toMatch(/problemas/);
  });
  it("exige selección, valor válido y algún cambio", () => {
    expect(previewBulk(items, new Set(), op({})).blocking).toMatch(/al menos un plato/);
    expect(opProblem(op({ value: 900 }))).toMatch(/porcentaje/);
    expect(opProblem(op({ value: Number.NaN }))).toMatch(/numérico/);
    expect(previewBulk(items, new Set(["c"]), op({})).blocking).toMatch(/ningún precio cambia/);
  });
});
