"use client";

import { cn } from "@/lib/format";

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
      className={cn("pressable relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150", checked ? "bg-success" : "bg-field")}
    >
      <span aria-hidden className={cn("absolute top-0.5 left-0.5 size-6 rounded-full bg-white transition-transform duration-150", checked && "translate-x-5")} />
    </button>
  );
}
