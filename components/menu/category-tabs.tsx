"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/format";
import { scrollBehavior } from "@/components/ui/motion-provider";

type Tab = { id: string; name: string; count: number };

export function CategoryTabs({
  tabs,
  activeId,
  onSelect,
}: {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
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
    <nav aria-label="Categorías del menú" className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b border-line bg-background">
      <div ref={scroller} className="no-scrollbar relative flex gap-6 overflow-x-auto px-5">
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
                "pressable -mb-px shrink-0 border-b-2 py-3.5 text-[15px] whitespace-nowrap",
                active ? "border-brand font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {tab.name}
              <span className="sr-only"> ({tab.count} platos)</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
