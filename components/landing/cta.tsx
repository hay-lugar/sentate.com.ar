import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PLAN, planPriceFullLabel, trialLongLabel } from "@/lib/config/plan";

/**
 * CTA final: lleva al alta real (/registro) y, para quien ya tiene cuenta, a /login.
 * Las demos siguen accesibles por enlaces explícitos.
 */
export function FinalCta() {
  const perks = [
    ...(PLAN.trialRequiresCard ? [] : ["Sin tarjeta para la prueba"]),
    `${planPriceFullLabel}, precio fijo`,
    "Cancelás cuando quieras",
  ];

  return (
    <section id="empezar" className="scroll-mt-24 px-3 pb-6 sm:px-5">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-ink px-6 py-16 text-white sm:px-14 sm:py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -bottom-40 -left-20 h-[28rem] w-[28rem] rounded-full bg-brand/45 blur-[120px]" />
          <div className="absolute -top-32 right-0 h-80 w-80 rounded-full bg-amber-400/20 blur-[100px]" />
          <div className="grain absolute inset-0 opacity-60" />
        </div>

        <div className="relative grid items-end gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-[2.6rem] leading-[0.95] font-bold sm:text-6xl">
              Tu local lleno.
              <br />
              <span className="text-brand">Tu fila, vacía.</span>
            </h2>
            <p className="mt-5 max-w-md text-lg text-white/80">
              {trialLongLabel[0].toUpperCase() + trialLongLabel.slice(1)}. Después, {planPriceFullLabel} y sin comisión por reserva.
            </p>
          </div>

          <div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/registro"
                className="pressable inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand px-6 font-semibold text-brand-fg shadow-brand"
              >
                Crear mi local <ArrowRight className="size-[18px]" aria-hidden />
              </Link>
              <Link
                href="/login"
                className="pressable inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white/10 px-6 font-semibold text-white ring-1 ring-white/20 hover:bg-white/15"
              >
                Ingresar
              </Link>
            </div>

            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/75">
              {perks.map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-emerald-400" strokeWidth={3} aria-hidden /> {t}
                </li>
              ))}
            </ul>

            <div className="mt-8 border-t border-white/15 pt-5 text-[14px]">
              <p className="text-white/70">Antes de registrarte, mirá cómo queda:</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 font-semibold">
                <Link href="/el-bodegon" className="underline underline-offset-4 hover:text-brand">
                  Ver la carta demo
                </Link>
                <Link href="/admin/el-bodegon" className="underline underline-offset-4 hover:text-brand">
                  Ver el panel demo
                </Link>
              </div>
              <p className="mt-2 text-[12px] text-white/55">Demo con datos de ejemplo: no guarda nada de lo que hagas.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
