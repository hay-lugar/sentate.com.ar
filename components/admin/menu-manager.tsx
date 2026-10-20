"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { GripVertical, ImageOff, Plus } from "lucide-react";
import { useState } from "react";
import type { Category } from "@/data/mock";
import { cn, formatPrice } from "@/lib/utils";

export function MenuManager({ initial }: { initial: Category[] }) {
  const [categories, setCategories] = useState(initial);

  const toggle = (catId: string, dishId: string) =>
    setCategories((cats) =>
      cats.map((c) =>
        c.id !== catId ? c : { ...c, dishes: c.dishes.map((d) => (d.id === dishId ? { ...d, active: !d.active } : d)) },
      ),
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
      {categories.map((cat, ci) => (
        <motion.section
          key={cat.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: ci * 0.05 }}
          className="rounded-[1.75rem] bg-surface p-2 shadow-soft ring-1 ring-line/70"
        >
          <div className="flex items-center gap-3 px-3 pt-3 pb-3">
            <h2 className="text-lg font-bold">{cat.name}</h2>
            <span className="rounded-lg bg-background px-2 py-0.5 text-[12px] font-semibold text-muted">
              {cat.dishes.filter((d) => d.active).length}/{cat.dishes.length} activos
            </span>
            <button
              type="button"
              className="pressable ml-auto inline-flex h-9 items-center gap-1 rounded-xl px-3 text-[13px] font-semibold text-brand hover:bg-brand-soft"
            >
              <Plus className="size-4" /> Plato
            </button>
          </div>
          <ul className="space-y-1">
            {cat.dishes.map((d) => (
              <li
                key={d.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl p-2 transition-opacity hover:bg-background",
                  !d.active && "opacity-55",
                )}
              >
                <GripVertical className="size-4 shrink-0 cursor-grab text-line" />
                <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-background text-muted">
                  {d.image ? <Image src={d.image} alt="" fill sizes="48px" className="object-cover" /> : <ImageOff className="size-4" />}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[14px] font-semibold">{d.name}</p>
                  <p className="mt-0.5 font-display text-[13px] font-bold text-muted">{formatPrice(d.price)}</p>
                </div>
                <Switch checked={d.active} onChange={() => toggle(cat.id, d.id)} label={`Activar ${d.name}`} />
              </li>
            ))}
          </ul>
        </motion.section>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "pressable flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300",
        checked ? "bg-brand" : "bg-line",
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
