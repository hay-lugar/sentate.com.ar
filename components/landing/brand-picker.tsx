"use client";

import { motion } from "framer-motion";
import { CalendarCheck, Check } from "lucide-react";
import { useState } from "react";
import { tenants } from "@/data/mock";
import { cn, initials, themeStyle } from "@/lib/utils";

/** Demo interactiva del theming dinámico: cambia las CSS vars de un preview con los temas reales del mock. */
export function BrandPicker() {
  const [active, setActive] = useState(0);
  const tenant = tenants[active];

  return (
    <div className="mt-7 flex flex-col gap-4">
      <div className="flex gap-2.5">
        {tenants.map((t, i) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Tema ${t.name}`}
            style={{ background: t.theme.primary }}
            className={cn(
              "pressable grid size-11 place-items-center rounded-2xl text-white ring-offset-2 ring-offset-surface",
              i === active && "ring-2 ring-ink",
            )}
          >
            {i === active && <Check className="size-5" strokeWidth={3} />}
          </button>
        ))}
      </div>

      <motion.div
        style={themeStyle(tenant.theme)}
        layout
        className="flex-1 rounded-[1.6rem] bg-accent p-4 transition-colors duration-500"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand font-display font-bold text-brand-fg transition-colors duration-500">
            {initials(tenant.name)}
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-bold text-accent-fg transition-colors duration-500">{tenant.name}</p>
            <p className="text-[13px] text-accent-fg/70">{tenant.cuisine}</p>
          </div>
        </div>
        <div className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand text-[14px] font-bold text-brand-fg shadow-brand transition-colors duration-500">
          <CalendarCheck className="size-4" /> Reservar mesa
        </div>
      </motion.div>
    </div>
  );
}
