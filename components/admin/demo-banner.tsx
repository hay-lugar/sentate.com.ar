"use client";

import { FlaskConical, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useDemo } from "./demo-provider";

/** Aviso permanente de modo demo + "Restablecer demo" con confirmación en línea. */
export function DemoBanner() {
  const { storage, resetDemo } = useDemo();
  const [confirming, setConfirming] = useState(false);

  const status =
    storage === "local"
      ? "Tus cambios de carta y ajustes se guardan solo en este navegador."
      : storage === "unavailable"
        ? "No se pudo guardar en este navegador: los cambios se pierden al recargar."
        : "Datos de ejemplo. Los cambios se guardan solo en este navegador.";

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-amber-50 p-3 text-amber-950 ring-1 ring-amber-200 sm:flex-row sm:items-center lg:mb-6">
      <div className="flex min-w-0 items-start gap-2.5 text-[13px] leading-snug">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <b className="font-semibold">Modo demo.</b> Reservas, clientes y métricas son ficticios. {status} Las reservas no se guardan.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
        {confirming ? (
          <>
            <span className="text-[13px] font-semibold">¿Borrar tus cambios?</span>
            <button
              type="button"
              onClick={() => {
                resetDemo();
                setConfirming(false);
              }}
              className="pressable h-9 rounded-xl bg-amber-900 px-3 text-[13px] font-semibold text-white"
            >
              Sí, restablecer
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="pressable h-9 rounded-xl px-3 text-[13px] font-semibold ring-1 ring-amber-300">
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="pressable inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/70 px-3 text-[13px] font-semibold ring-1 ring-amber-300 hover:bg-white"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Restablecer demo
          </button>
        )}
      </div>
    </div>
  );
}
