"use client";

import Image from "next/image";
import { CalendarCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { Dish } from "@/data/mock";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { formatPrice } from "@/lib/utils";
import { DishTags } from "./dish-tags";

export function DishSheet({ dish, onClose, onReserve }: { dish: Dish | null; onClose: () => void; onReserve: () => void }) {
  // Conserva el último plato durante la animación de salida
  const [shown, setShown] = useState(dish);
  useEffect(() => {
    if (dish) setShown(dish);
  }, [dish]);

  return (
    <BottomSheet open={!!dish} onClose={onClose} label={shown?.name ?? "Plato"} header={<DishTags tags={shown?.tags} />}>
      {shown && (
        <div className="px-6 pb-safe">
          {shown.image && (
            <div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-3xl bg-background shadow-soft">
              <Image src={shown.image} alt={shown.name} fill sizes="(max-width: 448px) 90vw, 400px" quality={85} className="object-cover" />
            </div>
          )}
          <h2 className="mt-5 text-[26px] leading-tight font-bold">{shown.name}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{shown.description}</p>

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
              <CalendarCheck className="size-[18px]" />
              Reservar para probarlo
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
