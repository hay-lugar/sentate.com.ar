// Estado de búsqueda del explorador. Vive en la URL (compartible, atrás/adelante) EXCEPTO la posición del visitante:
// las coordenadas nunca viajan en la URL ni se guardan; la URL solo lleva `cerca=1` y la persona vuelve a autorizarla.

export type Sort = "relevance" | "distance" | "name";
export type View = "list" | "map";
export type Price = "$" | "$$" | "$$$";

export type Filters = {
  q: string;
  locality: string | null;
  businessTypes: string[];
  cuisines: string[];
  price: Price[];
  openNow: boolean;
  /** Solo locales que reciben reservas por la web. */
  acceptsReservations: boolean;
  nearby: boolean;
  radiusKm: number | null;
  sort: Sort;
  view: View;
  page: number;
};

export const PAGE_SIZE = 20;
export const MAX_PAGE = 50;
export const RADIUS_OPTIONS = [1, 3, 5, 10, 25];

export const DEFAULT_FILTERS: Filters = {
  q: "",
  locality: null,
  businessTypes: [],
  cuisines: [],
  price: [],
  openNow: false,
  acceptsReservations: false,
  nearby: false,
  radiusKm: null,
  sort: "relevance",
  view: "list",
  page: 1,
};

const csv = (v: string | null, max: number) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]{1,40}$/.test(s))
    .slice(0, max);

export function filtersFromParams(sp: URLSearchParams): Filters {
  const sort = sp.get("orden");
  const radius = Number(sp.get("radio"));
  const page = Math.floor(Number(sp.get("pagina")));
  return {
    q: (sp.get("q") ?? "").slice(0, 80),
    locality: /^[a-z0-9-]{1,80}$/.test(sp.get("loc") ?? "") ? sp.get("loc") : null,
    businessTypes: csv(sp.get("tipo"), 10),
    cuisines: csv(sp.get("cocina"), 10),
    price: (sp.get("precio") ?? "").split(",").filter((p): p is Price => p === "$" || p === "$$" || p === "$$$").slice(0, 3),
    openNow: sp.get("abierto") === "1",
    acceptsReservations: sp.get("reserva") === "1",
    nearby: sp.get("cerca") === "1",
    radiusKm: RADIUS_OPTIONS.includes(radius) ? radius : null,
    sort: sort === "distance" || sort === "name" ? sort : "relevance",
    view: sp.get("vista") === "mapa" ? "map" : "list",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

export function filtersToParams(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.locality) sp.set("loc", f.locality);
  if (f.businessTypes.length) sp.set("tipo", f.businessTypes.join(","));
  if (f.cuisines.length) sp.set("cocina", f.cuisines.join(","));
  if (f.price.length) sp.set("precio", f.price.join(","));
  if (f.openNow) sp.set("abierto", "1");
  if (f.acceptsReservations) sp.set("reserva", "1");
  if (f.nearby) sp.set("cerca", "1");
  if (f.radiusKm) sp.set("radio", String(f.radiusKm));
  if (f.sort !== "relevance") sp.set("orden", f.sort);
  if (f.view === "map") sp.set("vista", "mapa");
  if (f.page > 1) sp.set("pagina", String(f.page));
  return sp;
}

/** Cantidad de filtros activos (sin contar vista, orden ni página). */
export function activeFilterCount(f: Filters): number {
  return (f.q ? 1 : 0) + (f.locality ? 1 : 0) + f.businessTypes.length + f.cuisines.length + f.price.length + (f.openNow ? 1 : 0) + (f.acceptsReservations ? 1 : 0) + (f.nearby ? 1 : 0);
}

export type Point = { lat: number; lng: number };
export type Bbox = [number, number, number, number];

/** Redondea a ~100 m: alcanza para la distancia aproximada y evita enviar la posición exacta. */
export const coarsePoint = (p: Point): Point => ({ lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 });

/** Cuerpo de public.explore_search a partir de los filtros (la posición solo se usa si hay permiso concedido). */
export function toSearchBody(f: Filters, opts: { point?: Point | null; bbox?: Bbox | null; limit?: number; offset?: number } = {}) {
  const point = f.nearby || f.sort === "distance" ? opts.point : null;
  const body: Record<string, unknown> = {
    sort: f.sort === "distance" && !point ? "name" : f.sort,
    limit: opts.limit ?? PAGE_SIZE,
    offset: opts.offset ?? (f.page - 1) * PAGE_SIZE,
  };
  if (f.q) body.q = f.q;
  if (f.locality) body.locality_key = f.locality;
  if (f.businessTypes.length) body.business_types = f.businessTypes;
  if (f.cuisines.length) body.cuisines = f.cuisines;
  if (f.price.length) body.price = f.price;
  if (f.openNow) body.open_now = true;
  if (f.acceptsReservations) body.accepts_reservations = true;
  if (point) {
    const c = coarsePoint(point);
    body.lat = c.lat;
    body.lng = c.lng;
    if (f.radiusKm) body.radius_km = f.radiusKm;
  }
  if (opts.bbox) body.bbox = opts.bbox;
  return body;
}
