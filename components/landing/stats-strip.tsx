import { Reveal } from "@/components/ui/reveal";

const STATS = [
  { value: "10 min", label: "para tener tu menú online" },
  { value: "0%", label: "de comisión por reserva" },
  { value: "+38%", label: "más reservas en promedio" },
  { value: "−60%", label: "llamadas al teléfono del local" },
];

const LOCALES = ["Don Ernesto", "Café Malva", "Pulpería 1890", "Sakura", "La Esquina", "Bodegón Norte", "Mostaza & Miel"];

export function StatsStrip() {
  return (
    <section className="border-y border-line/80 bg-surface/60">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-5 py-12 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06} className="px-2">
            <p className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{s.value}</p>
            <p className="mt-1 text-[14px] text-muted">{s.label}</p>
          </Reveal>
        ))}
      </div>
      <div className="relative overflow-hidden border-t border-line/80 py-6 [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
        <div className="flex w-max animate-[marquee_40s_linear_infinite] gap-14 pr-14">
          {[...LOCALES, ...LOCALES].map((name, i) => (
            <span key={i} className="font-display text-xl font-bold whitespace-nowrap text-muted/60">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
