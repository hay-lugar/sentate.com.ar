import type { OpenState } from "@/lib/domain/schedule";
import { cn } from "@/lib/format";

export function StatusDot({ open, className }: { open: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block size-2 rounded-full",
        open ? "animate-pulse-dot bg-emerald-500 text-emerald-500" : "bg-rose-500",
        className,
      )}
    />
  );
}

export function OpenStatusPill({ state }: { state: OpenState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-2.5 text-[12px] font-semibold",
        state.open ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800",
      )}
    >
      <StatusDot open={state.open} />
      {state.open ? "Abierto" : "Cerrado"}
      <span className="font-medium">· {state.label}</span>
    </span>
  );
}
