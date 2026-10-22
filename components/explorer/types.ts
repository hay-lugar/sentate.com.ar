export type ResultItem = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  business_type: string | null;
  cuisines: string[];
  price_range: string;
  cover_url: string | null;
  logo_url: string | null;
  lat: number;
  lng: number;
  locality: string;
  neighborhood: string;
  open_now: boolean;
  distance_m: number | null;
  featured?: boolean;
  accepts_reservations?: boolean;
  /** Promoción vigente cargada por la plataforma (solo si hay). */
  promotion?: { title: string; detail: string };
};

export type SearchResponse = { total: number; items: ResultItem[]; featured_items?: ResultItem[] };

export type FacetData = {
  total: number;
  localities: { key: string; label: string; province: string; count: number }[];
  business_types: { code: string; label: string; count: number }[];
  cuisines: { code: string; label: string; count: number }[];
  price: Record<string, number>;
};

export const formatDistance = (m: number | null) => {
  if (m === null) return null;
  if (m < 1000) return `a ~${Math.max(100, Math.round(m / 100) * 100)} m`;
  return `a ~${(m / 1000).toFixed(m < 10_000 ? 1 : 0).replace(".", ",")} km`;
};
