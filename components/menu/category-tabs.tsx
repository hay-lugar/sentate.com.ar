"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/format";
import { scrollBehavior } from "@/components/ui/motion-provider";

type Tab = { id: string; name: string; count: number };

export function CategoryTabs({
  tabs,
  activeId,
  onSelect,
  elevated,
}: {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  elevated: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  // Mantiene la pestaña activa visible dentro del carrusel horizontal
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-tab="${activeId}"]`);
    if (!el || !scroller.current) return;
    const left = el.offsetLeft - scroller.current.clientWidth / 2 + el.clientWidth / 2;
    scroller.current.scrollTo({ left, behavior: scrollBehavior() });
  }, [activeId]);

  return (
    <nav
      aria-label="Categorías del menú"
      className={cn(
        "sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-background/95 backdrop-blur-xl transition-shadow duration-300",
        elevated && "shadow-[0_10px_20px_-18px_rgb(23_19_15/0.5)]",
      )}
    >
      <div ref={scroller} className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 py-3">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              data-tab={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "pressable relative shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold whitespace-nowrap",
                active ? "text-brand-fg" : "text-muted hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-full bg-brand shadow-brand"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {tab.name}
                <span className={cn("text-[11px] tabular-nums", active ? "opacity-85" : "opacity-70")}>
                  {tab.count}
                  <span className="sr-only"> platos</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
