import type { TenantAccess } from "@/lib/domain/types";
import { planPriceFullLabel } from "@/lib/config/plan";
import { formatPlainDate } from "@/lib/time/zoned";

/** Prueba vencida (o suscripción inactiva): cuenta accesible, operación bloqueada. */
export function AccessExpired({ access }: { access: TenantAccess }) {
  const ended = formatPlainDate(access.trialEndsAt.slice(0, 10), { day: "numeric", month: "long" });
  return (
    <section className="max-w-lg py-6">
      <h1 className="text-2xl font-semibold">
        {access.subscriptionStatus === "trialing" ? `Tu prueba gratuita terminó el ${ended}` : "Tu suscripción no está activa"}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Tu cuenta y tus datos siguen guardados, pero la carta, las reservas y los ajustes quedan bloqueados hasta activar la suscripción (
        {planPriceFullLabel}).
      </p>
      <p className="mt-4 rounded-xl bg-subtle p-3 text-[14px] text-muted">
        La activación del pago desde el panel llega en la próxima fase. Mientras tanto, escribinos para habilitar tu cuenta.
      </p>
    </section>
  );
}
