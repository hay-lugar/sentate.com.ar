"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { bulkUpdatePricesAction } from "@/app/admin/[slug]/menu/precios/actions";
import { inputClass } from "@/components/menu/reservation/controls";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { previewBulk, type BulkItem, type BulkOp } from "@/lib/admin/bulk-price";

export function BulkPriceEditor({ tenantId, items }: { tenantId: string; items: BulkItem[] }) {
  const uid = useId();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<BulkOp>({ kind: "percent", value: 10, rounding: 0 });
  const [valueText, setValueText] = useState("10");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string; conflicts?: string[] } | null>(null);

  const preview = useMemo(() => previewBulk(items, selected, op), [items, selected, op]);
  const byCategory = useMemo(() => {
    const m = new Map<string, BulkItem[]>();
    for (const i of items) m.set(i.category, [...(m.get(i.category) ?? []), i]);
    return [...m.entries()];
  }, [items]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleCategory = (list: BulkItem[]) =>
    setSelected((s) => {
      const n = new Set(s);
      const all = list.every((i) => n.has(i.id));
      list.forEach((i) => (all ? n.delete(i.id) : n.add(i.id)));
      return n;
    });
  const setValue = (text: string) => {
    setValueText(text);
    const v = Number(text.replace(",", "."));
    setOp((o) => ({ ...o, value: text.trim() === "" ? Number.NaN : v }));
    setConfirming(false);
  };

  const apply = async () => {
    setBusy(true);
    setResult(null);
    const res = await bulkUpdatePricesAction(tenantId, preview.changed.map((r) => ({ id: r.id, price: r.newPrice, expected: r.version })));
    setBusy(false);
    setConfirming(false);
    if (res.ok) {
      setSelected(new Set());
      setResult({ tone: "ok", text: `Se actualizaron ${res.updated} ${res.updated === 1 ? "precio" : "precios"}.` });
    } else {
      setResult({ tone: "error", text: res.message, conflicts: res.conflictIds });
    }
    router.refresh();
  };

  const names = new Map(items.map((i) => [i.id, i.name]));

  if (items.length === 0) return <p className="text-[0.9375rem] text-muted">Todavía no hay platos cargados.</p>;

  return (
    <div className="max-w-3xl space-y-8 pb-24">
      <section aria-labelledby={`${uid}-op`} className="space-y-4">
        <h2 id={`${uid}-op`} className="border-b border-line pb-3 type-section">
          1. Qué cambio hacer
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${uid}-kind`} className="mb-1.5 block type-label">Tipo</label>
            <select id={`${uid}-kind`} value={op.kind} onChange={(e) => { setOp({ ...op, kind: e.target.value as BulkOp["kind"] }); setConfirming(false); }} className={inputClass}>
              <option value="percent">Subir o bajar un %</option>
              <option value="amount">Sumar o restar un monto</option>
              <option value="set">Poner un precio fijo</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-val`} className="mb-1.5 block type-label">
              {op.kind === "percent" ? "Porcentaje (negativo baja)" : op.kind === "amount" ? "Monto en $ (negativo resta)" : "Precio en $"}
            </label>
            <input id={`${uid}-val`} inputMode="decimal" value={valueText} onChange={(e) => setValue(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor={`${uid}-round`} className="mb-1.5 block type-label">Redondear a</label>
            <select id={`${uid}-round`} value={op.rounding} onChange={(e) => { setOp({ ...op, rounding: Number(e.target.value) as BulkOp["rounding"] }); setConfirming(false); }} className={inputClass}>
              <option value={0}>Peso entero</option>
              <option value={10}>$10</option>
              <option value={50}>$50</option>
              <option value={100}>$100</option>
            </select>
          </div>
        </div>
      </section>

      <section aria-labelledby={`${uid}-sel`} className="space-y-3">
        <h2 id={`${uid}-sel`} className="border-b border-line pb-3 type-section">
          2. A qué platos ({selected.size} elegidos)
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setSelected(new Set(items.map((i) => i.id)))}>Elegir todos</Button>
          <Button variant="quiet" size="sm" onClick={() => setSelected(new Set())}>Ninguno</Button>
        </div>
        {byCategory.map(([cat, list]) => (
          <fieldset key={cat} className="rounded-2xl border border-line/70">
            <legend className="sr-only">{cat}</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-line px-4 font-semibold">
              <input type="checkbox" checked={list.every((i) => selected.has(i.id))} onChange={() => toggleCategory(list)} className="size-5 accent-foreground" />
              {cat}
            </label>
            <ul className="divide-y divide-line/70">
              {list.map((i) => (
                <li key={i.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2">
                    <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} className="size-5 accent-foreground" />
                    <span className="min-w-0 flex-1 text-[0.9375rem] [overflow-wrap:anywhere]">{i.name}</span>
                    <span className="text-[0.9375rem] tabular-nums text-muted">{formatPrice(i.price)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </section>

      <section aria-labelledby={`${uid}-prev`} className="space-y-3">
        <h2 id={`${uid}-prev`} className="border-b border-line pb-3 type-section">
          3. Vista previa
        </h2>
        {preview.rows.length === 0 ? (
          <p className="text-[0.9375rem] text-muted">Elegí platos para ver cómo quedarían.</p>
        ) : (
          <ul className="divide-y divide-line/70 rounded-2xl border border-line/70">
            {preview.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-[0.9375rem]">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{r.name}</span>
                <span className="tabular-nums text-muted">{formatPrice(r.oldPrice)}</span>
                <span aria-hidden>→</span>
                <span className="tabular-nums font-medium">{formatPrice(r.newPrice)}</span>
                {r.problem && <span role="alert" className="text-[0.8125rem] text-danger">{r.problem}</span>}
                {!r.problem && r.newPrice === r.oldPrice && <span className="text-[0.8125rem] text-muted">sin cambio</span>}
              </li>
            ))}
          </ul>
        )}
        {preview.blocking && preview.rows.length > 0 && <p role="status" className="text-[0.9375rem] text-danger">{preview.blocking}</p>}

        {!confirming ? (
          <Button onClick={() => setConfirming(true)} disabled={!!preview.blocking || busy}>
            Revisar y aplicar a {preview.changed.length} {preview.changed.length === 1 ? "plato" : "platos"}
          </Button>
        ) : (
          <div role="group" aria-label="Confirmar cambio de precios" className="space-y-3 rounded-xl border border-line-strong p-4">
            <p className="text-[0.9375rem]">
              Vas a cambiar el precio de <strong>{preview.changed.length}</strong> {preview.changed.length === 1 ? "plato" : "platos"}
              {preview.unchanged > 0 ? ` (${preview.unchanged} sin cambio)` : ""}. Se aplica todo junto o nada, y el menú público se actualiza al instante.
            </p>
            <div className="flex gap-2">
              <Button onClick={apply} pending={busy}>Confirmar</Button>
              <Button variant="quiet" onClick={() => setConfirming(false)} disabled={busy}>Volver</Button>
            </div>
          </div>
        )}

        {result && (
          <div role={result.tone === "error" ? "alert" : "status"} className={result.tone === "ok" ? "text-[0.9375rem] text-success" : "space-y-1 text-[0.9375rem] text-danger"}>
            <p>{result.text}</p>
            {result.conflicts && result.conflicts.length > 0 && (
              <ul className="list-disc pl-5">
                {result.conflicts.map((id) => (
                  <li key={id}>{names.get(id) ?? "Un plato que ya no existe"}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
