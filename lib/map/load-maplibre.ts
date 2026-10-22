/** Estilo del mapa: el configurado, o el claro/oscuro de OpenFreeMap según el sistema (solo en el navegador). */
export function mapStyleUrl(): string {
  const custom = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  if (custom) return custom;
  const dark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;
}

/** Carga MapLibre en el navegador (nunca en el servidor) con el worker servido desde /maplibre. */
export async function loadMapLibre() {
  const [maplibregl] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  return maplibregl;
}
