"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DIETARY_DISCLAIMER, DIETARY_TAGS, TAG_LABELS, type DishTag, type PublicDish, type PublicTenant } from "@/lib/domain/types";
import { getOpenState } from "@/lib/domain/schedule";
import { useZonedNow } from "@/lib/hooks/use-zoned-now";
import type { ZonedNow } from "@/lib/time/zoned";
import type { TenantSource } from "@/lib/data/resolve";
import { BRAND } from "@/lib/config/brand";
import { filterCategories, SEARCH_MIN_DISHES } from "@/lib/menu/search";
import { Search } from "lucide-react";
import { scrollBehavior } from "@/components/ui/motion-provider";
import { CategoryTabs } from "./category-tabs";
import { DishCard } from "./dish-card";
import { ContactBar, ReserveBar } from "./reserve-bar";
import { CompactBar, RestaurantHeader } from "./restaurant-header";

// Las hojas (plato y pedido de mesa) pesan más que el resto de la carta y solo se usan al tocar: se descargan recién cuando
// se abren por primera vez, para no cargar ese JavaScript (ni framer-motion) al entrar.
const DishSheet = dynamic(() => import("./dish-sheet").then((m) => m.DishSheet), { ssr: false });
const ReservationFlow = dynamic(() => import("./reservation/reservation-flow").then((m) => m.ReservationFlow), { ssr: false });

/** Alto de la barra compacta (56) + tabs (~62): offset para anclar secciones. */
const STICKY_OFFSET = 118;

export function MenuView({
  tenant,
  source,
  initialNow,
  localEdits,
}: {
  tenant: PublicTenant;
  source: TenantSource;
  initialNow: ZonedNow;
  localEdits: boolean;
}) {
  const now = useZonedNow(tenant.timezone, initialNow);
  const status = getOpenState(tenant.schedule, now);
  // Filtro dietario (etiquetas que declara el local por plato). Solo aparece si la carta tiene alguna.
  const [diet, setDiet] = useState<DishTag[]>([]);
  const available = useMemo(() => DIETARY_TAGS.filter((t) => tenant.categories.some((c) => c.dishes.some((d) => d.tags?.includes(t)))), [tenant.categories]);
  const [query, setQuery] = useState("");
  const totalDishes = useMemo(() => tenant.categories.reduce((n, c) => n + c.dishes.length, 0), [tenant.categories]);
  const searchable = totalDishes >= SEARCH_MIN_DISHES;
  const categories = useMemo(() => {
    const byDiet = diet.length
      ? tenant.categories
          .map((c) => ({ ...c, dishes: c.dishes.filter((d) => diet.every((t) => d.tags?.includes(t))) }))
          .filter((c) => c.dishes.length)
      : tenant.categories;
    return filterCategories(byDiet, query);
  }, [tenant.categories, diet, query]);

  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const [compact, setCompact] = useState(false);
  const [dish, setDish] = useState<PublicDish | null>(null);
  const reservationsEnabled = tenant.reservationsEnabled !== false;
  const [reserving, setReserving] = useState(false);
  // Una vez abiertas se quedan montadas (para conservar la animación de cierre).
  const [dishEverOpen, setDishEverOpen] = useState(false);
  const [reserveEverOpen, setReserveEverOpen] = useState(false);
  const openDish = useCallback((d: PublicDish) => {
    setDishEverOpen(true);
    setDish(d);
  }, []);
  const openReservation = useCallback(() => {
    setReserveEverOpen(true);
    setReserving(true);
  }, []);
  // Desde el explorador: /slug?mesa=1 abre directamente el pedido de mesa.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- parámetro de URL leído tras hidratar (la carta se sirve estática)
    if (reservationsEnabled && new URLSearchParams(window.location.search).get("mesa") === "1") openReservation();
  }, [reservationsEnabled, openReservation]);

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
    <div className="relative mx-auto min-h-dvh max-w-xl bg-background pb-28 sm:border-x sm:border-line">
      <CompactBar tenant={tenant} status={status} visible={compact} />
      <RestaurantHeader tenant={tenant} status={status} demo={source === "demo"} localEdits={localEdits} />

      {tenant.promotion && (
        <aside aria-label="Promoción" className="mx-4 mt-4 rounded-xl border border-line-strong bg-subtle px-4 py-3">
          <p className="text-[0.8125rem] font-medium text-muted">Promoción</p>
          <p className="text-[1.0625rem] font-semibold [overflow-wrap:anywhere]">{tenant.promotion.title}</p>
          {tenant.promotion.detail && <p className="mt-0.5 text-[0.9375rem] text-muted [overflow-wrap:anywhere]">{tenant.promotion.detail}</p>}
        </aside>
      )}

      {categories.length > 0 ? (
        <>
          {searchable && (
            <div className="px-4 pt-4">
              <label htmlFor="carta-buscar" className="sr-only">
                Buscar en la carta
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  id="carta-buscar"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={60}
                  placeholder="Buscar en la carta"
                  autoComplete="off"
                  className="h-12 w-full rounded-xl bg-surface pr-4 pl-12 text-[1rem] ring-1 ring-field outline-none placeholder:text-muted focus:ring-2 focus:ring-foreground"
                />
              </div>
            </div>
          )}
          {available.length > 0 && (
            <div className="px-4 pt-4">
              <div role="group" aria-label="Filtrar por dieta" className="flex flex-wrap gap-2">
                {available.map((t) => {
                  const on = diet.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDiet((d) => (on ? d.filter((x) => x !== t) : [...d, t]))}
                      className={`pressable min-h-11 rounded-full border px-4 text-[0.9375rem] ${on ? "border-foreground bg-foreground text-background" : "border-line-strong hover:bg-subtle"}`}
                    >
                      {TAG_LABELS[t]}
                    </button>
                  );
                })}
              </div>
              {diet.length > 0 && <p className="mt-2 type-help">{DIETARY_DISCLAIMER}</p>}
            </div>
          )}
          <div ref={tabsAnchor} />
          <CategoryTabs
            tabs={categories.map((c) => ({ id: c.id, name: c.name, count: c.dishes.length }))}
            activeId={activeId}
            onSelect={scrollToCategory}
          />
          <main className="px-4">
            {categories.map((category) => (
              <section key={category.id} id={`cat-${category.id}`} aria-labelledby={`h-${category.id}`} className="pt-7">
                <h2 id={`h-${category.id}`} tabIndex={-1} className="type-section [overflow-wrap:anywhere] outline-none">
                  {category.name}
                </h2>
                <ul className="mt-1 divide-y divide-line/70">
                  {category.dishes.map((d) => (
                    <li key={d.id}>
                      <DishCard dish={d} onSelect={openDish} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </main>
        </>
      ) : diet.length > 0 || query.trim() ? (
        <main className="px-4 pt-6">
          <div role="status" className="rounded-2xl border border-line/70 px-6 py-10 text-center">
            <h2 className="type-section">Ningún plato coincide</h2>
            <button
              type="button"
              onClick={() => {
                setDiet([]);
                setQuery("");
              }}
              className="pressable mt-3 min-h-11 rounded-full border border-line-strong px-4 text-[0.9375rem]"
            >
              Quitar filtros
            </button>
          </div>
        </main>
      ) : (
        <main className="px-4 pt-6">
          <div className="rounded-2xl border border-line/70 px-6 py-10 text-center">
            <h2 className="type-section">La carta todavía no está publicada</h2>
            <p className="mx-auto mt-2 max-w-xs text-[0.9375rem] text-muted">{reservationsEnabled ? "Podés consultar por teléfono o pedir una mesa igual desde el botón de abajo." : "Podés consultar por teléfono desde el botón de abajo."}</p>
          </div>
        </main>
      )}

      <p className="mt-10 px-6 text-center type-help">
        {source === "demo" ? "Demo: precios y datos de ejemplo, en pesos argentinos." : "Precios en pesos argentinos."} Carta digital por {BRAND.name}.
      </p>

      {reservationsEnabled ? <ReserveBar onReserve={openReservation} /> : <ContactBar phone={tenant.phone} />}

      {(dish || dishEverOpen) && (
      <DishSheet
        dish={dish}
        onClose={closeDish}
        onReserve={!reservationsEnabled ? undefined : () => {
          setDish(null);
          if (reopenTimer.current) clearTimeout(reopenTimer.current);
          reopenTimer.current = window.setTimeout(openReservation, 220);
        }}
      />
      )}
      {reservationsEnabled && (reserving || reserveEverOpen) && <ReservationFlow tenant={tenant} source={source} open={reserving} onClose={closeReservation} />}
    </div>
  );
}
