import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { planPriceFullLabel, trialLongLabel } from "@/lib/config/plan";

/** Precio y condiciones: se dicen una sola vez en toda la landing. */
export function Pricing() {
  return (
    <section id="precio" aria-labelledby="precio-titulo" className="scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 id="precio-titulo" className="type-title">
          Precio
        </h2>
        <div className="mt-8 grid gap-8 md:grid-cols-[1.5fr_1fr] md:items-end">
          <div>
            <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{planPriceFullLabel}</p>
            <p className="mt-3 text-lg text-muted">
              {trialLongLabel[0].toUpperCase() + trialLongLabel.slice(1)}. Un solo plan con la carta, las reservas, el panel y el QR.
            </p>
          </div>
          <div>
            <Link href="/registro" className={buttonClass({ size: "lg", className: "w-full sm:w-auto" })}>
              Crear cuenta
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
