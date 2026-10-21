import { Lock } from "lucide-react";
import type { TenantAccess } from "@/lib/domain/types";
import { planPriceFullLabel } from "@/lib/config/plan";
import { formatPlainDate } from "@/lib/time/zoned";

/** Prueba vencida (o suscripción inactiva): cuenta accesible, operación bloqueada. */
export function AccessExpired({ access }: { access: TenantAccess }) {
  const ended = formatPlainDate(access.trialEndsAt.slice(0, 10), { day: "numeric", month: "long" });
  return (
    <section className="mx-auto mt-6 max-w-lg rounded-[1.75rem] bg-surface p-8 text-center shadow-soft ring-1 ring-line/70">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-900">
        <Lock className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-bold">
        {access.subscriptionStatus === "trialing" ? `Tu prueba gratuita terminó el ${ended}` : "Tu suscripción no está activa"}
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Tu cuenta y tus datos siguen guardados, pero la carta, las reservas y los ajustes quedan bloqueados hasta activar la
        suscripción ({planPriceFullLabel}).
      </p>
      <p className="mt-4 rounded-2xl bg-background p-3 text-[13px] text-muted">
        La activación del pago desde el panel llega en la próxima fase. Mientras tanto, escribinos para habilitar tu cuenta.
      </p>
    </section>
  );
}
