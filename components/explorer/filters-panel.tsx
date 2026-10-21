"use client";

import { useId } from "react";
import { cn } from "@/lib/format";
import { inputClass } from "@/components/menu/reservation/controls";
import { RADIUS_OPTIONS, type Filters, type Price, type Sort } from "@/lib/explorer/filters";
import type { FacetData } from "./types";

type Props = {
  filters: Filters;
  facets: FacetData;
  onChange: (next: Filters) => void;
  onLocate: () => void;
  geo: "idle" | "asking" | "granted" | "denied" | "unavailable";
  hasPoint: boolean;
};

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function FiltersPanel({ filters, facets, onChange, onLocate, geo, hasPoint }: Props) {
  const uid = useId();
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch, page: 1 });

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor={`${uid}-loc`} className="mb-1.5 block type-label">
          Localidad
        </label>
        <select id={`${uid}-loc`} value={filters.locality ?? ""} onChange={(e) => set({ locality: e.target.value || null })} className={inputClass}>
          <option value="">Todas</option>
          {facets.localities.map((l) => (
            <option key={`${l.key}`} value={l.key}>
              {l.label} ({l.count})
            </option>
          ))}
        </select>
      </div>

      <Group label="Tipo de comercio">
        {facets.business_types.map((b) => (
          <Pill key={b.code} on={filters.businessTypes.includes(b.code)} onClick={() => set({ businessTypes: toggle(filters.businessTypes, b.code) })}>
            {b.label} <span className="text-muted">({b.count})</span>
          </Pill>
        ))}
      </Group>

      <Group label="Cocina">
        {facets.cuisines.map((c) => (
          <Pill key={c.code} on={filters.cuisines.includes(c.code)} onClick={() => set({ cuisines: toggle(filters.cuisines, c.code) })}>
            {c.label} <span className="text-muted">({c.count})</span>
          </Pill>
        ))}
      </Group>

      <Group label="Rango de precios (declarado por el local)">
        {(["$", "$$", "$$$"] as Price[]).map((p) => (
          <Pill key={p} on={filters.price.includes(p)} onClick={() => set({ price: toggle(filters.price, p) })}>
            {p}
          </Pill>
        ))}
      </Group>

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={filters.openNow} onChange={(e) => set({ openNow: e.target.checked })} className="size-5 accent-foreground" />
        <span>
          <span className="block text-[15px] font-medium">Abierto ahora</span>
          <span className="block type-help">Según el horario del local y su zona horaria.</span>
        </span>
      </label>

      <div>
        <p className="mb-1.5 type-label">Cerca de mí</p>
        <p className="mb-2 type-help">Usamos tu ubicación solo para ordenar y filtrar por distancia aproximada. No la guardamos.</p>
        {hasPoint ? (
          <div className="space-y-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={filters.nearby} onChange={(e) => set({ nearby: e.target.checked, sort: e.target.checked ? "distance" : "relevance", radiusKm: e.target.checked ? filters.radiusKm : null })} className="size-5 accent-foreground" />
              <span className="text-[15px]">Solo cerca de mi ubicación</span>
            </label>
            {filters.nearby && (
              <div>
                <label htmlFor={`${uid}-radius`} className="mb-1.5 block type-label">
                  Distancia máxima
                </label>
                <select id={`${uid}-radius`} value={filters.radiusKm ?? ""} onChange={(e) => set({ radiusKm: e.target.value ? Number(e.target.value) : null })} className={inputClass}>
                  <option value="">Sin límite</option>
                  {RADIUS_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r} km
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={onLocate} disabled={geo === "asking"} className="pressable min-h-11 rounded-xl border border-line-strong px-4 text-[15px] font-medium hover:bg-subtle disabled:opacity-50">
            {geo === "asking" ? "Buscando tu ubicación…" : "Usar mi ubicación"}
          </button>
        )}
        {geo === "denied" && <p role="status" className="mt-2 type-help">No tenemos permiso para usar tu ubicación. Elegí una localidad para ver comercios de esa zona.</p>}
        {geo === "unavailable" && <p role="status" className="mt-2 type-help">No pudimos obtener tu ubicación. Elegí una localidad para ver comercios de esa zona.</p>}
      </div>

      <div>
        <label htmlFor={`${uid}-sort`} className="mb-1.5 block type-label">
          Ordenar por
        </label>
        <select id={`${uid}-sort`} value={filters.sort} onChange={(e) => set({ sort: e.target.value as Sort })} className={inputClass}>
          <option value="relevance">Relevancia</option>
          <option value="distance" disabled={!hasPoint}>
            Más cercanos{hasPoint ? "" : " (requiere tu ubicación)"}
          </option>
          <option value="name">Nombre</option>
        </select>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 type-label">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("pressable min-h-11 rounded-full border px-4 text-[15px]", on ? "border-foreground bg-foreground text-background [&_span]:text-background" : "border-line-strong hover:bg-subtle")}
    >
      {children}
    </button>
  );
}
