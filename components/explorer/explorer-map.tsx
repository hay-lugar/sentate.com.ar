"use client";

import { LocateFixed } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import { AR_CENTER } from "@/lib/explorer/profile";
import { MAP_STYLE_URL } from "@/components/admin/location-picker";
import type { Bbox, Point } from "@/lib/explorer/filters";
import type { ResultItem } from "./types";

type Props = {
  markers: ResultItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Se llama al terminar de mover el mapa; `byUser` distingue el movimiento de la persona del encuadre automático. */
  onViewChange: (bbox: Bbox, byUser: boolean) => void;
  point: Point | null;
  /** Elementos con los que encuadrar la primera vez (si la persona todavía no movió el mapa). */
  fitItems: ResultItem[];
  onFail: () => void;
  onLocate: () => void;
};

const SRC = "items";
const toGeoJSON = (items: ResultItem[]) => ({
  type: "FeatureCollection" as const,
  features: items.map((i) => ({ type: "Feature" as const, properties: { id: i.id }, geometry: { type: "Point" as const, coordinates: [i.lng, i.lat] } })),
});

/**
 * Mapa del explorador (MapLibre, carga dinámica). Agrupa marcadores en clusters, resalta el seleccionado y avisa del encuadre.
 * No reencuadra solo en cada respuesta: solo encuadra una vez, si la persona todavía no tocó el mapa.
 */
export default function ExplorerMap({ markers, selectedId, onSelect, onViewChange, point, fitItems, onFail, onLocate }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const moved = useRef(false);
  const fitted = useRef(false);
  const cb = useRef({ onSelect, onViewChange, onFail });
  const latest = useRef({ markers, selectedId, point, fitItems });
  const syncRef = useRef<() => void>(() => {});
  const fitRef = useRef<() => void>(() => {});

  useEffect(() => {
    cb.current = { onSelect, onViewChange, onFail };
    latest.current = { markers, selectedId, point, fitItems };
  });

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const [maplibregl] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
        if (disposed || !box.current) return;
        const map = new maplibregl.Map({
          container: box.current,
          style: MAP_STYLE_URL,
          center: [AR_CENTER.lng, AR_CENTER.lat],
          zoom: AR_CENTER.zoom,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        const emit = (byUser: boolean) => {
          const b = map.getBounds();
          cb.current.onViewChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], byUser);
        };

        map.on("load", () => {
          map.addSource(SRC, { type: "geojson", data: toGeoJSON(latest.current.markers), cluster: true, clusterRadius: 48, clusterMaxZoom: 14 });
          map.addSource("me", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer({ id: "clusters", type: "circle", source: SRC, filter: ["has", "point_count"], paint: { "circle-color": "#1d1d1f", "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26], "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } });
          map.addLayer({ id: "cluster-count", type: "symbol", source: SRC, filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13, "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#ffffff" } });
          map.addLayer({ id: "points", type: "circle", source: SRC, filter: ["!", ["has", "point_count"]], paint: { "circle-color": "#1d1d1f", "circle-radius": 8, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } });
          map.addLayer({ id: "selected", type: "circle", source: SRC, filter: ["==", ["get", "id"], ""], paint: { "circle-color": "#ffffff", "circle-radius": 11, "circle-stroke-width": 5, "circle-stroke-color": "#1d1d1f" } });
          map.addLayer({ id: "me", type: "circle", source: "me", paint: { "circle-color": "#2563eb", "circle-radius": 7, "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" } });
          ready.current = true;
          sync();
          fitRef.current();
          emit(false);
        });

        map.on("click", "clusters", async (e) => {
          const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
          const src = map.getSource(SRC) as GeoJSONSource;
          if (!f || !src) return;
          const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
          map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.5 });
        });
        map.on("click", "points", (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) cb.current.onSelect(id);
        });
        map.on("click", (e) => {
          if (!map.queryRenderedFeatures(e.point, { layers: ["points", "clusters"] }).length) cb.current.onSelect(null);
        });
        for (const l of ["clusters", "points"]) {
          map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
        }
        map.on("dragstart", () => (moved.current = true));
        map.on("zoomstart", (e) => {
          if (e.originalEvent) moved.current = true;
        });
        map.on("moveend", (e) => emit(!!(e as { originalEvent?: unknown }).originalEvent));
        map.on("error", () => {
          if (!map.isStyleLoaded() && !ready.current && !disposed) cb.current.onFail();
        });
        cleanup = () => {
          ready.current = false;
          map.remove();
          mapRef.current = null;
        };
      } catch {
        if (!disposed) cb.current.onFail();
      }
    })();

    function sync() {
      const map = mapRef.current;
      if (!map || !ready.current) return;
      (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(toGeoJSON(latest.current.markers));
      map.setFilter("selected", ["==", ["get", "id"], latest.current.selectedId ?? ""]);
      const p = latest.current.point;
      (map.getSource("me") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: p ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lng, p.lat] } }] : [],
      });
    }
    syncRef.current = sync;
    fitRef.current = () => {
      const map = mapRef.current;
      const items = latest.current.fitItems;
      if (!map || !ready.current || fitted.current || moved.current || !items.length) return;
      fitted.current = true;
      const lngs = items.map((i) => i.lng);
      const lats = items.map((i) => i.lat);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 56, left: 56, right: 56, bottom: 110 }, maxZoom: 15, duration: 0 });
    };

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    syncRef.current();
  }, [markers, selectedId, point]);

  // Primer encuadre (una vez y solo si la persona no movió el mapa).
  useEffect(() => {
    fitRef.current();
  }, [fitItems]);

  // Seleccionar desde la lista centra el mapa en el comercio.
  useEffect(() => {
    const map = mapRef.current;
    const item = selectedId ? latest.current.markers.find((m) => m.id === selectedId) : null;
    if (map && ready.current && item) map.easeTo({ center: [item.lng, item.lat], zoom: Math.max(map.getZoom(), 15), duration: 300 });
  }, [selectedId]);

  const goToMe = () => {
    if (point && mapRef.current) mapRef.current.easeTo({ center: [point.lng, point.lat], zoom: 14, duration: 400 });
    else onLocate();
  };

  return (
    <div className="relative h-full min-h-[320px] w-full">
      {/* Estilo en línea: el CSS de MapLibre (sin capa) pisaría las utilidades de Tailwind y el mapa quedaría sin alto. */}
      <div ref={box} role="application" aria-label="Mapa de comercios. La lista tiene la misma información." style={{ position: "absolute", inset: 0 }} />
      <button type="button" onClick={goToMe} className="pressable absolute bottom-6 left-3 grid size-11 place-items-center rounded-full border border-line bg-background shadow-sm" aria-label="Mi ubicación">
        <LocateFixed className="size-5" aria-hidden />
      </button>
    </div>
  );
}
