"use client";

import { CalendarCheck } from "lucide-react";
import { useState } from "react";
import type { PublicDish } from "@/lib/domain/types";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { formatPrice } from "@/lib/format";
import { DishImage } from "./dish-image";
import { DishTags } from "./dish-tags";

export function DishSheet({ dish, onClose, onReserve }: { dish: PublicDish | null; onClose: () => void; onReserve: () => void }) {
  // Conserva el último plato durante la animación de salida (estado derivado en render).
  const [shown, setShown] = useState(dish);
  if (dish && dish !== shown) setShown(dish);

  return (
    <BottomSheet open={!!dish} onClose={onClose} label={shown?.name ?? "Plato"} header={<DishTags tags={shown?.tags} />}>
      {shown && (
        <div className="px-6 pb-safe">
          {shown.image && (
            <div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-3xl bg-background shadow-soft">
              <DishImage src={shown.image} alt={shown.name} sizes="(max-width: 448px) 90vw, 400px" quality={85} />
            </div>
          )}
          <h2 className="mt-5 text-[26px] leading-tight font-bold [overflow-wrap:anywhere]">{shown.name}</h2>
          <p className="mt-2 text-[15px] leading-relaxed [overflow-wrap:anywhere] text-muted">{shown.description}</p>

          <div className="mt-6 flex items-center gap-3 border-t border-dashed border-line pt-5">
            <div>
              <p className="text-[12px] font-medium text-muted">Precio</p>
              <p className="font-display text-2xl font-bold tracking-tight">{formatPrice(shown.price)}</p>
            </div>
            <button
              type="button"
              onClick={onReserve}
              className="pressable ml-auto inline-flex h-13 items-center gap-2 rounded-2xl bg-brand px-5 font-semibold text-brand-fg shadow-brand"
            >
              <CalendarCheck className="size-[18px]" aria-hidden />
              Reservar para probarlo
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
