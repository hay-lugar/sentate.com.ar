"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDemo } from "./demo-provider";

/** Aviso permanente de modo demo + "Restablecer demo" con confirmación en línea. */
export function DemoBanner() {
  const { storage, resetDemo } = useDemo();
  const [confirming, setConfirming] = useState(false);

  const status =
    storage === "unavailable"
      ? "No se pudo guardar en este navegador: los cambios se pierden al recargar."
      : "Los cambios de carta y ajustes se guardan solo en este navegador.";

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-line/70 bg-subtle p-3 sm:flex-row sm:items-center">
      <p className="min-w-0 text-[14px] leading-snug">
        <b className="font-semibold">Modo demo.</b> Reservas y clientes son ficticios. {status}
      </p>
      <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
        {confirming ? (
          <>
            <span className="type-label">¿Borrar tus cambios?</span>
            <Button
              size="sm"
              onClick={() => {
                resetDemo();
                setConfirming(false);
              }}
            >
              Sí, restablecer
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
            Restablecer demo
          </Button>
        )}
      </div>
    </div>
  );
}
