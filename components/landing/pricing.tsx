import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { planPriceFullLabel, trialLongLabel } from "@/lib/config/plan";

/** Precio y condiciones: se dicen una sola vez en toda la landing. */
export function Pricing() {
  return (
    <section id="precio" aria-labelledby="precio-titulo" className="mx-auto max-w-5xl scroll-mt-20 px-4 pb-12 sm:px-6 sm:pb-20">
      <div className="rounded-[2rem] bg-subtle px-6 py-14 text-center sm:px-16 sm:py-20">
        <h2 id="precio-titulo" className="type-title">
          Precio
        </h2>
        <p className="mt-6 text-4xl font-bold tracking-tight tabular-nums sm:text-6xl">{planPriceFullLabel}</p>
        <p className="mx-auto mt-4 max-w-md text-lg text-muted">
          {trialLongLabel[0].toUpperCase() + trialLongLabel.slice(1)}. Un solo plan con la carta, las reservas, el panel y el QR.
        </p>
        <div className="mt-8">
          <Link href="/registro?intencion=local" className={buttonClass({ size: "lg", className: "w-full sm:w-auto" })}>
            Crear cuenta
          </Link>
        </div>
      </div>
    </section>
  );
}
