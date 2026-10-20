"use client";

import { motion } from "framer-motion";
import { CalendarCheck, Check } from "lucide-react";
import { useState } from "react";
import type { TenantSummary } from "@/lib/domain/types";
import { cn } from "@/lib/format";
import { themeStyle } from "@/lib/theme";
import { TenantLogo } from "@/components/ui/tenant-logo";

/** Demo interactiva del theming dinámico con los temas de los locales de ejemplo. */
export function BrandPicker({ examples }: { examples: TenantSummary[] }) {
  const [active, setActive] = useState(0);
  const tenant = examples[active];
  if (!tenant) return null;

  return (
    <div className="mt-7 flex flex-col gap-4">
      <div className="flex gap-2.5" role="group" aria-label="Temas de ejemplo">
        {examples.map((t, i) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Tema de ${t.name} (ejemplo)`}
            aria-pressed={i === active}
            style={{ background: t.theme.primary }}
            className={cn(
              "pressable grid size-11 place-items-center rounded-2xl text-white ring-offset-2 ring-offset-surface",
              i === active && "ring-2 ring-ink",
            )}
          >
            {i === active && <Check className="size-5" strokeWidth={3} aria-hidden />}
          </button>
        ))}
      </div>

      <motion.div style={themeStyle(tenant.theme)} layout className="flex-1 rounded-[1.6rem] bg-accent p-4 transition-colors duration-500">
        <div className="flex items-center gap-3">
          <TenantLogo name={tenant.name} logoUrl={tenant.logoUrl} className="size-12 rounded-2xl" />
          <div className="leading-tight">
            <p className="font-display text-lg font-bold text-accent-fg">{tenant.name}</p>
            <p className="text-[13px] text-accent-fg">{tenant.cuisine} · ejemplo</p>
          </div>
        </div>
        <div className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand text-[14px] font-bold text-brand-fg shadow-brand">
          <CalendarCheck className="size-4" aria-hidden /> Reservar mesa
        </div>
      </motion.div>
    </div>
  );
}
