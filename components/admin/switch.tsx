"use client";

import { motion } from "framer-motion";
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
      className={cn(
        "pressable flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300",
        checked ? "bg-emerald-600" : "bg-[#8f857a]",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className={cn("size-6 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.18)]", checked && "ml-auto")}
      />
    </button>
  );
}
