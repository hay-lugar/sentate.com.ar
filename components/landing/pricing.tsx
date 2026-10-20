import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PLAN, planPriceLabel, trialLongLabel } from "@/lib/config/plan";
import { Reveal } from "@/components/ui/reveal";

const INCLUDES = [
  "Menú digital con tu marca y tus colores",
  "Pedidos de mesa con confirmación desde el panel",
  "Carta editable desde el celular",
  "Un link y un QR para tu local",
  "Sin comisión por reserva",
];

export function Pricing() {
  return (
    <section id="precio" className="scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-2">
        <Reveal>
          <p className="text-[13px] font-bold tracking-[0.18em] text-brand uppercase">Precio</p>
          <h2 className="mt-3 text-4xl leading-[1.02] font-bold sm:text-5xl">
            Un solo plan.
            <br />
            <span className="text-muted">Sin letra chica.</span>
          </h2>
          <p className="mt-5 max-w-md text-lg text-muted">
            Empezás con {trialLongLabel}. Si te sirve, seguís por {planPriceLabel} por mes. Si no, no pagás nada.
          </p>
        </Reveal>

        <Reveal delay={0.08} className="rounded-[2rem] bg-surface p-7 shadow-lift ring-1 ring-line/70 sm:p-9">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-6xl font-bold tracking-tight">{planPriceLabel}</span>
            <span className="text-muted">{PLAN.currency} / mes</span>
          </div>
          <p className="mt-2 inline-flex rounded-full bg-brand-soft px-3 py-1 text-[13px] font-semibold text-brand">
            Primeros {PLAN.trialDays} días gratis{PLAN.trialRequiresCard ? "" : " · sin tarjeta"}
          </p>
          <ul className="mt-6 space-y-3">
            {INCLUDES.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px]">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <Link
            href="#empezar"
            className="pressable mt-8 flex h-14 items-center justify-center gap-2 rounded-2xl bg-ink font-semibold text-white shadow-lift hover:bg-ink/90"
          >
            Empezar prueba gratis <ArrowRight className="size-[18px]" aria-hidden />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
