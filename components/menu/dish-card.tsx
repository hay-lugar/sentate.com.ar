"use client";

import type { PublicDish } from "@/lib/domain/types";
import { formatPrice } from "@/lib/format";
import { DishImage } from "./dish-image";
import { DishTags } from "./dish-tags";

/** Fila de la carta: se separa con un divisor, no con una tarjeta. Abre el detalle del plato. */
export function DishCard({ dish, onSelect }: { dish: PublicDish; onSelect: (dish: PublicDish) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(dish)}
      aria-label={`${dish.name}, ${formatPrice(dish.price)}. Ver detalle`}
      className="pressable flex w-full gap-4 py-4 text-left"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 text-[1rem] leading-snug font-semibold [overflow-wrap:anywhere]">{dish.name}</h3>
        {dish.description && <p className="mt-1 line-clamp-2 text-[0.875rem] leading-relaxed [overflow-wrap:anywhere] text-muted">{dish.description}</p>}
        <DishTags tags={dish.tags} className="mt-2" />
        <span className="mt-auto pt-2 text-[1rem] font-medium tabular-nums">{formatPrice(dish.price)}</span>
      </div>
      {dish.image && (
        <div className="relative size-24 shrink-0 self-start overflow-hidden rounded-lg bg-subtle">
          <DishImage src={dish.image} alt="" sizes="96px" />
        </div>
      )}
    </button>
  );
}
