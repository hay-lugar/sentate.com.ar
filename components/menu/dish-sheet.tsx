"use client";

import { useState } from "react";
import type { PublicDish } from "@/lib/domain/types";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
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
            <div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-xl bg-subtle">
              <DishImage src={shown.image} alt={shown.name} sizes="(max-width: 448px) 90vw, 400px" quality={85} />
            </div>
          )}
          <h2 className="mt-5 text-2xl leading-tight font-semibold [overflow-wrap:anywhere]">{shown.name}</h2>
          {shown.description && <p className="mt-2 text-[15px] leading-relaxed [overflow-wrap:anywhere] text-muted">{shown.description}</p>}

          <div className="mt-6 flex items-center gap-4 border-t border-line pt-5">
            <p className="text-2xl font-semibold tabular-nums">{formatPrice(shown.price)}</p>
            <Button variant="secondary" onClick={onReserve} className="ml-auto">
              Solicitar mesa
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
