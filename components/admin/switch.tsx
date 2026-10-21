"use client";

import { cn } from "@/lib/format";

/** Interruptor. El botón mide 44 × 44 px (área táctil); la pista visible es más chica. */
export function Switch({
  checked,
  onChange,
  label,
  labelledBy,
}: {
  checked: boolean;
  onChange: () => void;
  label?: string;
  labelledBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      onClick={onChange}
      className="pressable grid h-11 w-14 shrink-0 place-items-center rounded-full"
    >
      <span aria-hidden className={cn("relative block h-7 w-12 rounded-full transition-colors duration-150", checked ? "bg-success" : "bg-field")}>
        <span className={cn("absolute top-0.5 left-0.5 size-6 rounded-full bg-white transition-transform duration-150", checked && "translate-x-5")} />
      </span>
    </button>
  );
}
