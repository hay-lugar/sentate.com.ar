"use client";

import { Clock3 } from "lucide-react";
import { useDemo } from "./demo-provider";

/** Modo real: días restantes de prueba. */
export function TrialBanner() {
  const { live } = useDemo();
  if (!live || live.access.subscriptionStatus !== "trialing" || !live.access.canOperate) return null;
  const days = live.access.trialDaysLeft;
  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-2xl bg-brand-soft p-3 text-[13px] text-foreground ring-1 ring-brand/15 lg:mb-6">
      <Clock3 className="size-4 shrink-0 text-brand" aria-hidden />
      <p>
        <b className="font-semibold">Prueba gratuita:</b> {days === 1 ? "te queda 1 día" : `te quedan ${days} días`}. Después se
        bloquea la operación del panel hasta activar la suscripción.
      </p>
    </div>
  );
}
