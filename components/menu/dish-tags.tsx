import { TAG_LABELS, type DishTag } from "@/lib/domain/types";
import { cn } from "@/lib/format";

const LABELS = TAG_LABELS;

/** Etiquetas discretas: texto con borde fino, sin colores ni iconos. */
export function DishTags({ tags, className }: { tags?: DishTag[]; className?: string }) {
  if (!tags?.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((tag) => (
        <li key={tag} className="rounded-md border border-line-strong px-1.5 py-1 text-[0.8125rem] leading-none text-muted">
          {LABELS[tag]}
        </li>
      ))}
    </ul>
  );
}
