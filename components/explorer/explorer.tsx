"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { List, Map as MapIcon, Search, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/menu/reservation/controls";
import { cn } from "@/lib/format";
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  activeFilterCount,
  filtersFromParams,
  filtersToParams,
  toSearchBody,
  type Bbox,
  type Filters,
  type Point,
} from "@/lib/explorer/filters";
import { applyChoice, applyInterpretation, interpretQuery, type Choice, type Interpretation } from "@/lib/explorer/parse-query";
import { FiltersPanel } from "./filters-panel";
import { ResultCard } from "./result-card";
import type { FacetData, ResultItem, SearchResponse } from "./types";

const ExplorerMap = dynamic(() => import("./explorer-map"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[320px] animate-pulse bg-subtle" aria-hidden />,
});

const NO_ITEMS: ResultItem[] = [];

type Geo = "idle" | "asking" | "granted" | "denied" | "unavailable";
type Remote = { status: "loading" } | { status: "ok"; data: SearchResponse } | { status: "error"; message: string };

const subscribeDesktop = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsDesktop = () =>
  useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );

/** Pide resultados con cancelación y protección contra respuestas fuera de orden (gana siempre la última petición). */
function useRemoteSearch(body: Record<string, unknown> | null, delay = 0, enabled = true): [Remote, () => void] {
  const [state, setState] = useState<Remote>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const key = body ? JSON.stringify(body) : "";

  useEffect(() => {
    if (!enabled || !key) return;
    const mine = ++seq.current;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => (s.status === "ok" ? s : { status: "loading" }));
      try {
        const res = await fetch("/api/explorar", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: ctrl.signal, cache: "no-store" });
        if (mine !== seq.current) return;
        if (res.status === 429) return setState({ status: "error", message: "Hiciste muchas búsquedas seguidas. Esperá unos segundos y reintentá." });
        if (!res.ok) return setState({ status: "error", message: "No pudimos cargar los comercios. Probá de nuevo." });
        setState({ status: "ok", data: (await res.json()) as SearchResponse });
      } catch (e) {
        if ((e as Error).name === "AbortError" || mine !== seq.current) return;
        setState({ status: "error", message: "No hay conexión. Revisala y probá de nuevo." });
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, delay, enabled, nonce]);

  return [state, () => setNonce((n) => n + 1)];
}

export function Explorer({ facets, favorites }: { facets: FacetData; favorites: string[] | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const spKey = sp.toString();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(spKey)), [spKey]);
  const isDesktop = useIsDesktop();

  const [text, setText] = useState(filters.q);
  const [ambiguous, setAmbiguous] = useState<Interpretation["ambiguous"]>([]);
  const [point, setPoint] = useState<Point | null>(null);
  const [geo, setGeo] = useState<Geo>("idle");
  const [area, setArea] = useState<Bbox | null>(null);
  const [viewBbox, setViewBbox] = useState<Bbox | null>(null);
  const [mapMoved, setMapMoved] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  const facetLookup = useMemo(
    () => ({
      localities: facets.localities.map((l) => ({ key: l.key, label: l.label, province: l.province })),
      businessTypes: facets.business_types.map((b) => ({ code: b.code, label: b.label })),
      cuisines: facets.cuisines.map((c) => ({ code: c.code, label: c.label })),
    }),
    [facets],
  );

  const go = useCallback(
    (next: Filters, mode: "push" | "replace" = "push") => {
      const qs = filtersToParams(next).toString();
      (mode === "push" ? router.push : router.replace)(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
  const change = (next: Filters) => {
    setArea(null);
    go(next);
  };

  // Si cambia la URL desde afuera (atrás/adelante), el cuadro de texto la sigue.
  const [seenQ, setSeenQ] = useState(filters.q);
  if (seenQ !== filters.q) {
    setSeenQ(filters.q);
    setText(filters.q);
  }

  // ── Búsqueda de la lista ──
  const listBody = useMemo(() => toSearchBody(filters, { point, bbox: area }), [filters, point, area]);
  const [list, retry] = useRemoteSearch(listBody);

  // ── Marcadores del mapa (por zona visible, acotados) ──
  const showMap = (isDesktop || filters.view === "map") && !mapFailed;
  const markerBody = useMemo(
    () => (viewBbox ? toSearchBody({ ...filters, page: 1, sort: "name" }, { point, bbox: viewBbox, limit: 300, offset: 0 }) : null),
    [filters, point, viewBbox],
  );
  const [markerRes] = useRemoteSearch(markerBody, 350, showMap && !!viewBbox);
  const markers = markerRes.status === "ok" ? markerRes.data.items : NO_ITEMS;
  const listItems = list.status === "ok" ? list.data.items : NO_ITEMS;
  const total = list.status === "ok" ? list.data.total : null;
  const featuredItems = list.status === "ok" ? (list.data.featured_items ?? NO_ITEMS) : NO_ITEMS;
  const pages = total === null ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (total !== null && filters.page > pages) go({ ...filters, page: 1 }, "replace");
  }, [total, pages, filters, go]);

  const selected = useMemo(() => [...listItems, ...markers].find((i) => i.id === selectedId) ?? null, [listItems, markers, selectedId]);

  // ── Acciones ──
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const i = interpretQuery(text, facetLookup);
    setAmbiguous(i.ambiguous);
    const next = applyInterpretation(filters, i);
    setText(next.q);
    change(next);
  };

  const pick = (c: Choice, term: string) => {
    setAmbiguous((a) => a.filter((x) => x.term !== term));
    change(applyChoice(filters, c));
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return setGeo("unavailable");
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeo("granted");
        change({ ...filters, nearby: true, sort: "distance", page: 1 });
      },
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) document.getElementById(`res-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const chips = buildChips(filters, facets, area !== null, (next) => change(next), () => setArea(null));
  const count = activeFilterCount(filters) + (area ? 1 : 0);
  const clearAll = () => {
    setText("");
    setAmbiguous([]);
    setArea(null);
    go({ ...DEFAULT_FILTERS, view: filters.view });
  };

  const favoriteIds = useMemo(() => new Set(favorites ?? []), [favorites]);
  const favoriteFor = (id: string) => ({ initial: favoriteIds.has(id), loginHref: favorites === null ? `/login?next=${encodeURIComponent(`${pathname}${spKey ? `?${spKey}` : ""}`)}` : null });

  const filtersUi = <FiltersPanel filters={filters} facets={facets} onChange={change} onLocate={locate} geo={geo} hasPoint={!!point} />;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
      <form onSubmit={submit} role="search" className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="explore-q" className="sr-only">
            Buscar comercios, platos o zonas
          </label>
          <input
            id="explore-q"
            type="search"
            value={text}
            maxLength={80}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nombre, plato o zona. Ej.: parrilla en Rafaela"
            className={cn(inputClass, "pl-12")}
            autoComplete="off"
          />
        </div>
        <Button type="submit">Buscar</Button>
        <Button variant="secondary" onClick={() => setSheet(true)} className="lg:hidden" aria-label={`Filtros${count ? `, ${count} activos` : ""}`}>
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden min-[420px]:inline">Filtros{count ? ` (${count})` : ""}</span>
        </Button>
      </form>

      {ambiguous.map((a) => (
        <div key={a.term} role="group" aria-label={`Aclarar «${a.term}»`} className="mt-3 rounded-xl border border-line bg-subtle p-3">
          <p className="mb-2 text-[15px]">¿Qué querés decir con «{a.term}»?</p>
          <div className="flex flex-wrap gap-2">
            {a.choices.map((c, i) => (
              <button key={i} type="button" onClick={() => pick(c, a.term)} className="pressable min-h-11 rounded-full border border-line-strong bg-background px-4 text-[15px] hover:bg-subtle">
                {c.kind === "locality" ? `${c.label} (${c.province})` : c.kind === "business_type" ? `Tipo: ${c.label}` : `Cocina: ${c.label}`}
              </button>
            ))}
          </div>
        </div>
      ))}

      {filters.nearby && !point && (
        <div role="status" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-subtle p-3">
          <p className="min-w-0 flex-1 text-[15px]">Para ordenar por cercanía necesitamos tu ubicación. Solo se usa para calcular distancias y no se guarda.</p>
          <Button variant="secondary" onClick={locate} pending={geo === "asking"}>
            Usar mi ubicación
          </Button>
        </div>
      )}
      {geo === "denied" && (
        <p role="status" className="mt-3 text-[15px] text-muted">
          No tenemos permiso para usar tu ubicación. Elegí una localidad en los filtros para ver comercios de esa zona.
        </p>
      )}

      {chips.length > 0 && (
        <ul aria-label="Filtros activos" className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={c.remove} className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[15px] hover:bg-subtle" aria-label={`Quitar filtro: ${c.label}`}>
                {c.label}
                <X className="size-4 text-muted" aria-hidden />
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={clearAll} className="pressable min-h-11 rounded-full px-3 text-[15px] text-muted underline underline-offset-2 hover:text-foreground">
              Limpiar todo
            </button>
          </li>
        </ul>
      )}

      <div className="mt-4 lg:grid lg:grid-cols-[272px_minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6">
        <aside aria-label="Filtros" className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1 pb-6">{filtersUi}</div>
        </aside>

        <div className={cn("min-w-0", !isDesktop && filters.view === "map" && "hidden")}>
          <div className="mb-3 flex items-center gap-3">
            <p role="status" aria-live="polite" className="mr-auto text-[15px]">
              {total === null ? "Buscando…" : total === 0 ? "Sin resultados" : `${total} ${total === 1 ? "comercio" : "comercios"}${pages > 1 ? ` · página ${filters.page} de ${pages}` : ""}`}
            </p>
            {!isDesktop && (
              <ViewToggle view={filters.view} onChange={(view) => go({ ...filters, view }, "replace")} mapDisabled={mapFailed} />
            )}
          </div>

          {list.status === "error" && (
            <div role="alert" className="rounded-xl border border-line p-4">
              <p className="mb-3 text-[15px]">{list.message}</p>
              <Button variant="secondary" onClick={retry}>
                Reintentar
              </Button>
            </div>
          )}
          {list.status === "loading" && <ListSkeleton />}
          {list.status === "ok" && total === 0 && (
            <div className="rounded-xl border border-line p-6 text-center">
              <p className="text-[16px] font-medium">{facets.total === 0 ? "Todavía no hay comercios en el explorador." : "No encontramos comercios con esos criterios."}</p>
              {facets.total > 0 && (
                <>
                  <p className="mt-1 type-help">Probá con otra palabra o quitá algún filtro.</p>
                  <Button variant="secondary" onClick={clearAll} className="mt-4">
                    Limpiar filtros
                  </Button>
                </>
              )}
            </div>
          )}
          {list.status === "ok" && featuredItems.length > 0 && (
            <section aria-labelledby="destacados" className="mb-5">
              <h2 id="destacados" className="mb-2 type-label">Destacados</h2>
              <ul className="space-y-3">
                {featuredItems.map((item) => (
                  <li key={`f-${item.id}`}>
                    <ResultCard item={item} facets={facets} favorite={favoriteFor(item.id)} selected={item.id === selectedId} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 type-help">Los destacados se muestran aparte del orden de los resultados.</p>
            </section>
          )}
          {list.status === "ok" && total! > 0 && (
            <ul className="space-y-3">
              {listItems.map((item) => (
                <li key={item.id}>
                  <ResultCard item={item} facets={facets} favorite={favoriteFor(item.id)} selected={item.id === selectedId} onSelect={(id) => (setSelectedId(id), go({ ...filters, view: "map" }, "replace"))} />
                </li>
              ))}
            </ul>
          )}

          {pages > 1 && (
            <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-3">
              <Button variant="secondary" disabled={filters.page <= 1} onClick={() => go({ ...filters, page: filters.page - 1 })}>
                Anterior
              </Button>
              <span className="type-help">
                {(filters.page - 1) * PAGE_SIZE + 1}–{Math.min(filters.page * PAGE_SIZE, total ?? 0)} de {total}
              </span>
              <Button variant="secondary" disabled={filters.page >= pages} onClick={() => go({ ...filters, page: filters.page + 1 })}>
                Siguiente
              </Button>
            </nav>
          )}
        </div>

        {showMap && (
          <div className={cn("min-w-0", !isDesktop && filters.view !== "map" && "hidden")}>
            {!isDesktop && (
              <div className="mb-3 flex items-center justify-end">
                <ViewToggle view={filters.view} onChange={(view) => go({ ...filters, view }, "replace")} mapDisabled={false} />
              </div>
            )}
            <div className="relative h-[62dvh] overflow-hidden rounded-xl border border-line lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)]">
              <ExplorerMap
                markers={markers}
                selectedId={selectedId}
                onSelect={select}
                onViewChange={(bbox, byUser) => {
                  setViewBbox(bbox);
                  if (byUser) setMapMoved(true);
                }}
                point={point}
                fitItems={listItems}
                onFail={() => setMapFailed(true)}
                onLocate={locate}
              />
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                {mapMoved && viewBbox && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="pointer-events-auto bg-background shadow-sm"
                    onClick={() => {
                      setArea(viewBbox);
                      go({ ...filters, page: 1 }, "replace");
                      setMapMoved(false);
                    }}
                  >
                    Buscar en esta zona
                  </Button>
                )}
              </div>
              <p className="pointer-events-none absolute right-3 bottom-6 rounded-md bg-background/90 px-2 py-1 text-[13px]" role="status">
                {markerRes.status === "ok" ? `${markers.length} en esta vista${markerRes.data.total > markers.length ? ` de ${markerRes.data.total}` : ""}` : "Cargando mapa…"}
              </p>
              {selected && (
                <div className="absolute inset-x-3 bottom-16 z-10">
                  <div className="relative">
                    <ResultCard item={selected} facets={facets} favorite={favoriteFor(selected.id)} compact selected />
                    <button type="button" onClick={() => setSelectedId(null)} aria-label="Cerrar" className="absolute top-1 right-1 grid size-11 place-items-center rounded-full text-muted hover:bg-subtle">
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {mapFailed && (
        <p role="status" className="mt-4 rounded-xl border border-line bg-subtle p-3 text-[15px]">
          No pudimos cargar el mapa. La lista sigue funcionando con los mismos filtros.
        </p>
      )}

      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        label="Filtros"
        header={<h2 className="px-4 pb-2 type-section">Filtros</h2>}
        footer={
          <div className="flex gap-2 p-4">
            <Button variant="quiet" onClick={clearAll}>
              Limpiar
            </Button>
            <Button className="flex-1" onClick={() => setSheet(false)}>
              {total === null ? "Ver resultados" : `Ver ${total} ${total === 1 ? "resultado" : "resultados"}`}
            </Button>
          </div>
        }
      >
        <div className="px-4 pb-4">{sheet ? filtersUi : null}</div>
      </BottomSheet>
    </div>
  );
}

function ViewToggle({ view, onChange, mapDisabled }: { view: "list" | "map"; onChange: (v: "list" | "map") => void; mapDisabled: boolean }) {
  return (
    <div role="group" aria-label="Vista" className="inline-flex rounded-xl border border-line-strong p-0.5">
      <button type="button" aria-pressed={view === "list"} onClick={() => onChange("list")} className={cn("pressable inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[15px]", view === "list" && "bg-foreground text-background")}>
        <List className="size-4" aria-hidden /> Lista
      </button>
      <button type="button" aria-pressed={view === "map"} disabled={mapDisabled} onClick={() => onChange("map")} className={cn("pressable inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[15px] disabled:opacity-40", view === "map" && "bg-foreground text-background")}>
        <MapIcon className="size-4" aria-hidden /> Mapa
      </button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-28 animate-pulse rounded-xl bg-subtle" />
      ))}
    </ul>
  );
}

function buildChips(f: Filters, facets: FacetData, hasArea: boolean, apply: (n: Filters) => void, clearArea: () => void) {
  const out: { id: string; label: string; remove: () => void }[] = [];
  if (f.q) out.push({ id: "q", label: `«${f.q}»`, remove: () => apply({ ...f, q: "", page: 1 }) });
  if (f.locality) out.push({ id: "loc", label: facets.localities.find((l) => l.key === f.locality)?.label ?? f.locality, remove: () => apply({ ...f, locality: null, page: 1 }) });
  for (const b of f.businessTypes) out.push({ id: `bt-${b}`, label: facets.business_types.find((x) => x.code === b)?.label ?? b, remove: () => apply({ ...f, businessTypes: f.businessTypes.filter((x) => x !== b), page: 1 }) });
  for (const c of f.cuisines) out.push({ id: `cu-${c}`, label: `Cocina: ${facets.cuisines.find((x) => x.code === c)?.label ?? c}`, remove: () => apply({ ...f, cuisines: f.cuisines.filter((x) => x !== c), page: 1 }) });
  for (const p of f.price) out.push({ id: `pr-${p}`, label: `Precio ${p}`, remove: () => apply({ ...f, price: f.price.filter((x) => x !== p), page: 1 }) });
  if (f.openNow) out.push({ id: "open", label: "Abierto ahora", remove: () => apply({ ...f, openNow: false, page: 1 }) });
  if (f.nearby) out.push({ id: "near", label: f.radiusKm ? `Cerca de mí · ${f.radiusKm} km` : "Cerca de mí", remove: () => apply({ ...f, nearby: false, radiusKm: null, sort: f.sort === "distance" ? "relevance" : f.sort, page: 1 }) });
  if (hasArea) out.push({ id: "area", label: "En esta zona del mapa", remove: clearArea });
  return out;
}
