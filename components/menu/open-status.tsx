import type { OpenState } from "@/lib/domain/schedule";
import { cn } from "@/lib/format";

export function StatusDot({ open, className }: { open: boolean; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 rounded-full", open ? "bg-success" : "bg-danger", className)} />;
}

/** Estado del local en texto (no solo color): «Abierto · Cierra a las 00:30». */
export function OpenStatusPill({ state }: { state: OpenState }) {
  return (
    <span className="inline-flex items-center gap-2 text-[14px] font-medium">
      <StatusDot open={state.open} />
      <span className={state.open ? "text-success" : "text-danger"}>{state.open ? "Abierto" : "Cerrado"}</span>
      <span className="font-normal text-muted">· {state.label}</span>
    </span>
  );
}
