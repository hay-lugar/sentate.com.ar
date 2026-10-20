"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import type { PublicDish, PublicTenant } from "@/lib/domain/types";
import { getOpenState } from "@/lib/domain/schedule";
import { useZonedNow } from "@/lib/hooks/use-zoned-now";
import type { ZonedNow } from "@/lib/time/zoned";
import { scrollBehavior } from "@/components/ui/motion-provider";
import { CategoryTabs } from "./category-tabs";
import { DishCard } from "./dish-card";
import { DishSheet } from "./dish-sheet";
import { ReservationFlow } from "./reservation/reservation-flow";
import { ReserveBar } from "./reserve-bar";
import { CompactBar, RestaurantHeader } from "./restaurant-header";

/** Alto de la barra compacta (56) + tabs (~62): offset para anclar secciones. */
const STICKY_OFFSET = 118;

export function MenuView({ tenant, initialNow, localEdits }: { tenant: PublicTenant; initialNow: ZonedNow; localEdits: boolean }) {
  const now = useZonedNow(tenant.timezone, initialNow);
  const status = getOpenState(tenant.schedule, now);
  const categories = tenant.categories;

  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const [compact, setCompact] = useState(false);
  const [dish, setDish] = useState<PublicDish | null>(null);
  const [reserving, setReserving] = useState(false);

  const tabsAnchor = useRef<HTMLDivElement>(null);
  const lockSpy = useRef<number | null>(null);
  const reopenTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (lockSpy.current) clearTimeout(lockSpy.current);
      if (reopenTimer.current) clearTimeout(reopenTimer.current);
    },
    [],
  );

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
    window.scrollTo({ top, behavior: scrollBehavior() });
    // Mueve el foco al encabezado de la sección para lectores de pantalla y teclado.
    document.getElementById(`h-${id}`)?.focus({ preventScroll: true });
  }, []);

  const closeDish = useCallback(() => setDish(null), []);
  const closeReservation = useCallback(() => setReserving(false), []);

  return (
    <div className="relative mx-auto min-h-dvh max-w-md bg-background pb-36 sm:shadow-lift">
      <CompactBar tenant={tenant} status={status} visible={compact} />
      <RestaurantHeader tenant={tenant} status={status} localEdits={localEdits} />

      {categories.length > 0 ? (
        <>
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
                <h2 id={`h-${category.id}`} tabIndex={-1} className="mb-3 px-1 text-[22px] font-bold [overflow-wrap:anywhere] outline-none">
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
          </main>
        </>
      ) : (
        <main className="px-4 pt-6">
          <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-line px-6 py-12 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
              <UtensilsCrossed className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-xl font-bold">La carta todavía no está publicada</h2>
            <p className="mt-1 max-w-xs text-[14px] text-muted">Podés consultar por teléfono o pedir una mesa igual desde el botón de abajo.</p>
          </div>
        </main>
      )}

      <p className="mt-10 px-6 text-center text-[12px] text-muted">
        Precios de ejemplo en pesos argentinos. Esta es una demo: los datos son ficticios.
        <br />
        Menú digital por <span className="font-display font-bold text-foreground">sentate.</span>
      </p>

      <ReserveBar onReserve={() => setReserving(true)} />

      <DishSheet
        dish={dish}
        onClose={closeDish}
        onReserve={() => {
          setDish(null);
          if (reopenTimer.current) clearTimeout(reopenTimer.current);
          reopenTimer.current = window.setTimeout(() => setReserving(true), 220);
        }}
      />
      <ReservationFlow tenant={tenant} open={reserving} onClose={closeReservation} />
    </div>
  );
}
