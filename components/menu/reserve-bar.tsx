"use client";

import { Button } from "@/components/ui/button";

/** Barra inferior fija con la acción principal del comensal. */
export function ReserveBar({ onReserve }: { onReserve: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background pt-3 pb-safe">
      <div className="mx-auto max-w-xl px-4">
        <Button size="lg" onClick={onReserve} aria-haspopup="dialog" className="w-full">
          Solicitar mesa
        </Button>
      </div>
    </div>
  );
}
