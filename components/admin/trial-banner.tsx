"use client";

import { useDemo } from "./demo-provider";

/** Modo real: días restantes de prueba. */
export function TrialBanner() {
  const { live } = useDemo();
  if (!live || live.access.subscriptionStatus !== "trialing" || !live.access.canOperate) return null;
  const days = live.access.trialDaysLeft;
  return (
    <p className="mb-6 rounded-xl border border-line bg-subtle p-3 text-[14px] leading-snug">
      <b className="font-semibold">Prueba gratuita:</b> {days === 1 ? "te queda 1 día" : `te quedan ${days} días`}. Después se bloquea la operación del panel
      hasta activar la suscripción.
    </p>
  );
}
