"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dish, Tenant } from "@/data/mock";
import type { OpenState } from "@/lib/utils";
import { CategoryTabs } from "./category-tabs";
import { DishCard } from "./dish-card";
import { DishSheet } from "./dish-sheet";
import { useOpenState } from "./open-status";
import { ReservationFlow } from "./reservation-flow";
import { ReserveBar } from "./reserve-bar";
import { CompactBar, RestaurantHeader } from "./restaurant-header";

export type PublicTenant = Omit<Tenant, "reservations" | "stats">;

/** Alto de la barra compacta (56) + tabs (~62): offset para anclar secciones. */
const STICKY_OFFSET = 118;

export function MenuView({ tenant, initialStatus }: { tenant: PublicTenant; initialStatus: OpenState }) {
  const status = useOpenState(tenant, initialStatus);

  const categories = useMemo(
    () =>
      tenant.categories
        .map((c) => ({ ...c, dishes: c.dishes.filter((d) => d.active) }))
        .filter((c) => c.dishes.length > 0),
    [tenant.categories],
  );

  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const [compact, setCompact] = useState(false);
  const [dish, setDish] = useState<Dish | null>(null);
  const [reserving, setReserving] = useState(false);

  const tabsAnchor = useRef<HTMLDivElement>(null);
  const lockSpy = useRef<number | null>(null);

  // Scroll-spy + aparición de la barra compacta, en un único listener con rAF.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const anchor = tabsAnchor.current;
      if (anchor) setCompact(anchor.getBoundingClientRect().top <= 56);
      if (lockSpy.current) return;

      let current = categories[0]?.id;
      for (const c of categories) {
        const el = document.getElementById(`cat-${c.id}`);
        if (el && el.getBoundingClientRect().top - STICKY_OFFSET - 24 <= 0) current = c.id;
      }
      // Al tocar fondo, la última categoría queda activa aunque sea corta
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = categories.at(-1)?.id ?? current;
      }
      if (current) setActiveId(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [categories]);

  const scrollToCategory = useCallback((id: string) => {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    setActiveId(id);
    if (lockSpy.current) clearTimeout(lockSpy.current);
    lockSpy.current = window.setTimeout(() => (lockSpy.current = null), 900);
    const top = el.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET + 1;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  const closeDish = useCallback(() => setDish(null), []);
  const closeReservation = useCallback(() => setReserving(false), []);

  return (
    <div className="relative mx-auto min-h-dvh max-w-md bg-background pb-32 sm:shadow-lift">
      <CompactBar tenant={tenant} status={status} visible={compact} />
      <RestaurantHeader tenant={tenant} status={status} />

      <div ref={tabsAnchor} />
      <CategoryTabs
        tabs={categories.map((c) => ({ id: c.id, name: c.name, count: c.dishes.length }))}
        activeId={activeId}
        onSelect={scrollToCategory}
        elevated={compact}
      />

      <main className="px-4">
        {categories.map((category) => (
          <section key={category.id} id={`cat-${category.id}`} aria-labelledby={`h-${category.id}`} className="pt-6">
            <h2 id={`h-${category.id}`} className="mb-3 px-1 text-[22px] font-bold">
              {category.name}
            </h2>
            <ul className="space-y-3">
              {category.dishes.map((d) => (
                <li key={d.id}>
                  <DishCard dish={d} onSelect={setDish} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-10 text-center text-[12px] text-muted">
          Precios en pesos argentinos, IVA incluido.
          <br />
          Menú digital por <span className="font-display font-bold text-foreground">sentate.</span>
        </p>
      </main>

      <ReserveBar open={status.open} onReserve={() => setReserving(true)} />

      <DishSheet
        dish={dish}
        onClose={closeDish}
        onReserve={() => {
          setDish(null);
          setTimeout(() => setReserving(true), 220);
        }}
      />
      <ReservationFlow tenant={tenant} open={reserving} onClose={closeReservation} />
    </div>
  );
}
