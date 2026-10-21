import { PLAN, planPriceLabel } from "@/lib/config/plan";
import { Reveal } from "@/components/ui/reveal";

// Solo atributos del producto y del plan: nada de métricas sin evidencia.
const ITEMS = [
  { value: `${PLAN.trialDays} días`, label: "de prueba gratis, sin tarjeta" },
  { value: planPriceLabel, label: `${PLAN.currency} por mes, precio único` },
  { value: "0%", label: "de comisión por reserva" },
  { value: "1 link", label: "para menú y reservas" },
];

export function ValueStrip() {
  return (
    <section className="border-y border-line/80 bg-surface/60">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-5 py-12 lg:grid-cols-4">
        {ITEMS.map((s, i) => (
          <li key={s.label} className="px-2">
            <Reveal delay={i * 0.06}>
              <p className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{s.value}</p>
              <p className="mt-1 text-[14px] text-muted">{s.label}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
