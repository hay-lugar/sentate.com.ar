/** Carga MapLibre en el navegador (nunca en el servidor) con el worker servido desde /maplibre. */
export async function loadMapLibre() {
  const [maplibregl] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  return maplibregl;
}
