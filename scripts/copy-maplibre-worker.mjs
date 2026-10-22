// maplibre-gl 6 carga su worker como módulo ES aparte (+ un chunk compartido). El empaquetador no lo resuelve solo,
// así que se copian a /public/maplibre (generado, ignorado por git) y el mapa lo declara con setWorkerUrl.
import { copyFileSync, mkdirSync } from "node:fs";

const SRC = new URL("../node_modules/maplibre-gl/dist/", import.meta.url);
const DST = new URL("../public/maplibre/", import.meta.url);
mkdirSync(DST, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(new URL(f, SRC), new URL(f, DST));
