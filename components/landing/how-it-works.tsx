import { Bell, Eye, GripVertical, Plus, QrCode, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/reveal";
import { cn, formatPrice, hashUnit } from "@/lib/utils";
import { BrandPicker } from "./brand-picker";

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="max-w-2xl">
          <p className="text-[13px] font-bold tracking-[0.18em] text-brand uppercase">Cómo funciona</p>
          <h2 className="mt-3 text-4xl leading-[1.02] font-bold sm:text-6xl">
            Tres pasos.
            <br />
            <span className="text-muted">Cero dolores de cabeza.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid auto-rows-[minmax(0,auto)] gap-4 lg:grid-cols-6">
          {/* 01 — Menú (card grande) */}
          <BentoCard className="lg:col-span-4" delay={0}>
            <StepTag n="01" icon={UtensilsCrossed} />
            <h3 className="mt-5 text-2xl font-bold sm:text-3xl">Cargá tu menú en minutos</h3>
            <p className="mt-2 max-w-sm text-muted">
              Platos, fotos, precios y etiquetas. Cambiá un precio desde el celu y se actualiza al instante.
            </p>

            <div className="mt-8 rounded-[1.6rem] bg-background p-3 ring-1 ring-line/70 sm:p-4">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="font-display font-bold">Parrilla</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white">
                  <Plus className="size-3.5" /> Agregar plato
                </span>
              </div>
              <ul className="space-y-2">
                {[
                  { name: "Ojo de bife 400g", price: 26500, on: true },
                  { name: "Entraña fina", price: 22900, on: true },
                  { name: "Bondiola braseada", price: 19900, on: false },
                ].map((d, i) => (
                  <li
                    key={d.name}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-soft ring-1 ring-line/60",
                      i === 0 && "sm:-mx-2 sm:rotate-[-1.2deg] sm:shadow-lift",
                    )}
                  >
                    <GripVertical className="size-4 text-line" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{d.name}</span>
                    <span className="hidden font-display text-[14px] font-bold sm:block">{formatPrice(d.price)}</span>
                    <span className={cn("flex h-6 w-10 items-center rounded-full p-0.5", d.on ? "bg-emerald-500" : "bg-line")}>
                      <span className={cn("size-5 rounded-full bg-white shadow-sm", d.on && "translate-x-4")} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </BentoCard>

          {/* 02 — QR */}
          <BentoCard tone="brand" className="relative overflow-hidden lg:col-span-2" delay={0.08}>
            <StepTag n="02" icon={QrCode} inverted />
            <h3 className="mt-5 text-2xl font-bold">Poné el QR en la mesa</h3>
            <p className="mt-2 text-[15px] opacity-80">Y un link para Instagram y Google Maps.</p>
            <div className="mt-8 flex justify-center">
              <div className="rotate-3 rounded-3xl bg-white p-3 shadow-lift transition-transform duration-500 group-hover:rotate-0">
                <FakeQR />
              </div>
            </div>
          </BentoCard>

          {/* 03 — Reservas */}
          <BentoCard tone="ink" className="lg:col-span-2" delay={0}>
            <StepTag n="03" icon={Bell} inverted />
            <h3 className="mt-5 text-2xl font-bold">Recibí reservas, no llamadas</h3>
            <div className="relative mt-6 h-32">
              {[
                { who: "Lucas · 2 pers", when: "Hoy 20:45", z: "z-30 translate-y-0" },
                { who: "Camila · 6 pers", when: "Mañana 21:30", z: "z-20 translate-y-4 scale-95 opacity-70" },
                { who: "Julián · 2 pers", when: "Jue 21:00", z: "z-10 translate-y-8 scale-90 opacity-40" },
              ].map((n) => (
                <div
                  key={n.who}
                  className={cn(
                    "absolute inset-x-0 top-0 flex items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/10 backdrop-blur transition-transform duration-500",
                    n.z,
                  )}
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-brand text-brand-fg">
                    <Bell className="size-4" />
                  </span>
                  <div className="text-[13px] leading-tight">
                    <p className="font-semibold">{n.who}</p>
                    <p className="text-white/60">{n.when}</p>
                  </div>
                  <span className="ml-auto rounded-full bg-emerald-400/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    Confirmar
                  </span>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Marca */}
          <BentoCard className="lg:col-span-2" delay={0.08}>
            <h3 className="text-2xl font-bold">Tu marca, tus colores</h3>
            <p className="mt-2 text-muted">Nada de plantillas genéricas: el menú adopta la identidad de tu local.</p>
            <BrandPicker />
          </BentoCard>

          {/* Métricas */}
          <BentoCard className="lg:col-span-2" delay={0.16}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold">Métricas que importan</h3>
                <p className="mt-2 text-muted">Visitas al menú, platos más vistos y horarios pico.</p>
              </div>
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
                <Eye className="size-5" />
              </span>
            </div>
            <div className="mt-8 flex h-32 items-end gap-2">
              {[38, 52, 44, 61, 58, 86, 100].map((h, i) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div
                    style={{ height: `${h}%` }}
                    className={cn(
                      "w-full rounded-xl transition-all duration-500 group-hover:opacity-100",
                      i === 6 ? "bg-brand shadow-brand" : "bg-brand/20",
                    )}
                  />
                  <span className="text-[11px] font-semibold text-muted">{"LMMJVSD"[i]}</span>
                </div>
              ))}
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

const TONES = {
  surface: "bg-surface ring-1 ring-line/70",
  brand: "bg-brand text-brand-fg shadow-brand",
  ink: "bg-ink text-white",
};

function BentoCard({
  children,
  className,
  delay,
  tone = "surface",
}: {
  children: ReactNode;
  className?: string;
  delay: number;
  tone?: keyof typeof TONES;
}) {
  return (
    <Reveal
      delay={delay}
      className={cn(
        "group rounded-[2rem] p-6 shadow-soft transition-shadow duration-500 hover:shadow-lift sm:p-8",
        TONES[tone],
        className,
      )}
    >
      {children}
    </Reveal>
  );
}

function StepTag({ n, icon: Icon, inverted }: { n: string; icon: React.ComponentType<{ className?: string }>; inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "grid size-11 place-items-center rounded-2xl",
          inverted ? "bg-white/15 text-current" : "bg-brand-soft text-brand",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className={cn("font-display text-sm font-bold tracking-widest", inverted ? "opacity-60" : "text-muted")}>PASO {n}</span>
    </div>
  );
}

/** QR decorativo determinístico (no escaneable) con los tres "finder patterns". */
function FakeQR() {
  const N = 21;
  const finder = (x: number, y: number) =>
    [
      [0, 0],
      [N - 7, 0],
      [0, N - 7],
    ].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  const finderFill = (x: number, y: number) => {
    const lx = x % (N - 7) === x ? x : x - (N - 7);
    const ly = y % (N - 7) === y ? y : y - (N - 7);
    const ring = lx === 0 || lx === 6 || ly === 0 || ly === 6;
    const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
    return ring || core;
  };
  const cells: ReactNode[] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const on = finder(x, y) ? finderFill(x, y) : hashUnit(`qr${x}-${y}`) > 0.52;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} rx={0.3} />);
    }
  return (
    <svg viewBox={`0 0 ${N} ${N}`} className="size-28 fill-ink" aria-label="Código QR de ejemplo">
      {cells}
    </svg>
  );
}
