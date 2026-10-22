"use client";

import { Button, buttonClass } from "@/components/ui/button";

/** Barra inferior fija con la acción principal del comensal. */
export function ReserveBar({ onReserve }: { onReserve: () => void }) {
  return (
    <div className="bar-blur fixed inset-x-0 bottom-0 z-40 border-t border-line/70 pt-3 pb-safe">
      <div className="mx-auto max-w-xl px-4">
        <Button size="lg" onClick={onReserve} aria-haspopup="dialog" className="w-full">
          Solicitar mesa
        </Button>
      </div>
    </div>
  );
}

/** Locales que no reciben reservas por la web: solo carta y un acceso directo para consultar por teléfono. */
export function ContactBar({ phone }: { phone: string }) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return (
    <div className="bar-blur fixed inset-x-0 bottom-0 z-40 border-t border-line/70 pt-3 pb-safe">
      <div className="mx-auto max-w-xl px-4">
        <a href={`tel:${digits}`} className={buttonClass({ variant: "secondary", size: "lg", className: "w-full" })}>
          Llamar al local
        </a>
      </div>
    </div>
  );
}
