import Link from "next/link";
import { Search } from "lucide-react";

// Categorías = valores reales del catálogo de tipos de comercio (public.business_types). Si todavía no hay locales
// de una categoría, el explorador muestra su estado vacío: no se inventan resultados.
const QUICK = [
  { label: "Parrillas", href: "/explorar?tipo=parrilla" },
  { label: "Pizzerías", href: "/explorar?tipo=pizzeria" },
  { label: "Cafeterías", href: "/explorar?tipo=cafeteria" },
  { label: "Bares", href: "/explorar?tipo=bar" },
  { label: "Heladerías", href: "/explorar?tipo=heladeria" },
];

/** Entrada para comensales: buscar y explorar. La propuesta para negocios vive en su propia sección («Para negocios»). */
export function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-4 pt-14 pb-12 text-center sm:px-6 sm:pt-20 sm:pb-16">
      <h1 className="type-display">Descubrí dónde comer.</h1>
      <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">Buscá por nombre, plato o zona, mirá la carta y pedí tu mesa.</p>

      <form action="/explorar" role="search" className="mx-auto mt-8 flex max-w-xl gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="hero-q" className="sr-only">
            Buscar locales, platos o zonas
          </label>
          <input
            id="hero-q"
            name="q"
            type="search"
            maxLength={80}
            placeholder="Local, plato o zona"
            autoComplete="off"
            className="h-14 w-full rounded-xl bg-surface pr-4 pl-12 text-[1rem] ring-1 ring-field outline-none placeholder:text-muted focus:ring-2 focus:ring-foreground"
          />
        </div>
        <button type="submit" className="pressable h-14 shrink-0 rounded-xl bg-foreground px-6 text-[1rem] font-medium text-background">
          Buscar
        </button>
      </form>

      <ul aria-label="Categorías" className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2">
        {QUICK.map((q) => (
          <li key={q.href}>
            <Link href={q.href} className="pressable inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 text-[0.9375rem] hover:bg-subtle">
              {q.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6">
        <Link href="/explorar" className="inline-flex min-h-11 items-center text-[0.9375rem] underline underline-offset-4">
          Ver el mapa de locales
        </Link>
      </p>
    </section>
  );
}
