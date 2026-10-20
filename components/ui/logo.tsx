import { cn } from "@/lib/utils";

/** Wordmark de Sentate: la silla minimalista + punto final como gesto de "listo". */
export function Logo({ className, mono = false }: { className?: string; mono?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight", className)}>
      <span
        className={cn(
          "grid size-8 place-items-center rounded-xl",
          mono ? "bg-current/10" : "bg-brand text-brand-fg shadow-brand",
        )}
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="2.5" width="7" height="9" rx="2.5" />
          <path d="M5 13.5h13" />
          <path d="M7 13.5 6 21M16.5 13.5 17.5 21" />
        </svg>
      </span>
      <span>
        sentate<span className={mono ? "" : "text-brand"}>.</span>
      </span>
    </span>
  );
}
