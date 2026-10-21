"use client";

import { useEffect, useRef, useState } from "react";
import { AR_CENTER } from "@/lib/explorer/profile";

export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron";

type Props = {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  label: string;
};

/**
 * Mapa con un pin ajustable (clic o arrastre). MapLibre se carga solo acá: no pesa en la carta, el login ni el resto del panel.
 * Si el proveedor de teselas o WebGL fallan, avisa y el formulario sigue funcionando con las coordenadas escritas.
 */
export default function LocationPicker({ lat, lng, onChange, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<{ move: (lat: number, lng: number) => void } | null>(null);
  const latest = useRef(onChange);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const [{ default: maplibregl }] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
        if (disposed || !box.current) return;
        const hasPoint = lat !== null && lng !== null;
        const map = new maplibregl.Map({
          container: box.current,
          style: MAP_STYLE_URL,
          center: hasPoint ? [lng, lat] : [AR_CENTER.lng, AR_CENTER.lat],
          zoom: hasPoint ? 16 : AR_CENTER.zoom,
          attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        const marker = new maplibregl.Marker({ draggable: true, color: "#1d1d1f" });
        if (hasPoint) marker.setLngLat([lng, lat]).addTo(map);
        marker.on("dragend", () => {
          const p = marker.getLngLat();
          latest.current(p.lat, p.lng);
        });
        map.on("click", (e) => {
          marker.setLngLat(e.lngLat).addTo(map);
          latest.current(e.lngLat.lat, e.lngLat.lng);
        });
        map.on("error", (e) => {
          // Un error de teselas sueltas no rompe el editor; solo avisamos si el estilo nunca cargó.
          if (!map.isStyleLoaded() && !disposed) setFailed(true);
          void e;
        });
        handle.current = {
          move: (la, ln) => {
            marker.setLngLat([ln, la]).addTo(map);
            map.easeTo({ center: [ln, la], zoom: Math.max(map.getZoom(), 16), duration: 400 });
          },
        };
        cleanup = () => map.remove();
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      handle.current = null;
      cleanup();
    };
    // El mapa se crea una sola vez: los movimientos posteriores llegan por `handle.move`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lat !== null && lng !== null) handle.current?.move(lat, lng);
  }, [lat, lng]);

  if (failed) {
    return (
      <p role="alert" className="rounded-xl border border-line bg-subtle p-4 text-[15px]">
        No se pudo cargar el mapa. Podés escribir las coordenadas en «Ingresar coordenadas manualmente».
      </p>
    );
  }
  return <div ref={box} role="application" aria-label={label} className="h-72 w-full overflow-hidden rounded-xl border border-line sm:h-96" />;
}
