"use client";

import { useEffect, useState } from "react";
import { getOpenState, type OpenState } from "@/lib/utils";
import type { Tenant } from "@/data/mock";
import { cn } from "@/lib/utils";

/** Estado Abierto/Cerrado: viene calculado del server y se refresca en el cliente cada minuto. */
export function useOpenState(tenant: Pick<Tenant, "hours" | "closedDays">, initial: OpenState) {
  const [state, setState] = useState(initial);
  useEffect(() => {
    const tick = () => setState(getOpenState(tenant));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [tenant]);
  return state;
}

export function StatusDot({ open, className }: { open: boolean; className?: string }) {
  return (
    <span
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
        state.open ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
    >
      <StatusDot open={state.open} />
      {state.open ? "Abierto" : "Cerrado"}
      <span className="font-medium opacity-70">· {state.label}</span>
    </span>
  );
}
