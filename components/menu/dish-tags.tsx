import { Flame, Leaf, Sparkles, Star, WheatOff, type LucideIcon } from "lucide-react";
import type { DishTag } from "@/lib/domain/types";
import { cn } from "@/lib/format";

const TAGS: Record<DishTag, { label: string; icon: LucideIcon; className: string }> = {
  popular: { label: "Popular", icon: Star, className: "bg-brand-soft text-brand" },
  nuevo: { label: "Nuevo", icon: Sparkles, className: "bg-violet-50 text-violet-800" },
  veggie: { label: "Veggie", icon: Leaf, className: "bg-emerald-50 text-emerald-800" },
  picante: { label: "Picante", icon: Flame, className: "bg-red-50 text-red-700" },
  "sin-tacc": { label: "Sin TACC", icon: WheatOff, className: "bg-amber-50 text-amber-800" },
};

export function DishTags({ tags, className }: { tags?: DishTag[]; className?: string }) {
  if (!tags?.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((tag) => {
        const { label, icon: Icon, className } = TAGS[tag];
        return (
          <li
            key={tag}
            className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}
          >
            <Icon className="size-3" strokeWidth={2.5} fill={tag === "popular" ? "currentColor" : "none"} />
            {label}
          </li>
        );
      })}
    </ul>
  );
}
