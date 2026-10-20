"use client";

import { Plus } from "lucide-react";
import type { PublicDish } from "@/lib/domain/types";
import { cn, formatPrice } from "@/lib/format";
import { DishImage } from "./dish-image";
import { DishTags } from "./dish-tags";

export function DishCard({ dish, onSelect }: { dish: PublicDish; onSelect: (dish: PublicDish) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(dish)}
      aria-label={`${dish.name}, ${formatPrice(dish.price)}. Ver detalle`}
      className={cn(
        "pressable group flex w-full gap-4 rounded-3xl bg-surface p-3 text-left",
        "shadow-soft ring-1 ring-line/70 hover:shadow-lift active:shadow-soft",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col py-1.5 pl-1.5">
        <DishTags tags={dish.tags} className="mb-2" />
        <h3 className="line-clamp-2 text-[16px] leading-snug font-semibold [overflow-wrap:anywhere] text-foreground">{dish.name}</h3>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed [overflow-wrap:anywhere] text-muted">{dish.description}</p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="font-display text-[17px] font-bold tracking-tight">{formatPrice(dish.price)}</span>
          {!dish.image && <AddDot />}
        </div>
      </div>

      {dish.image && (
        <div className="relative size-[7.25rem] shrink-0 overflow-hidden rounded-2xl bg-background">
          <DishImage
            src={dish.image}
            alt=""
            sizes="116px"
            className="transition-transform duration-500 ease-out group-hover:scale-105"
          />
          <AddDot className="absolute right-2 bottom-2" />
        </div>
      )}
    </button>
  );
}

function AddDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 place-items-center rounded-full bg-surface text-brand shadow-soft ring-1 ring-line/80",
        "transition-colors group-hover:bg-brand group-hover:text-brand-fg",
        className,
      )}
    >
      <Plus className="size-4" strokeWidth={2.75} />
    </span>
  );
}
