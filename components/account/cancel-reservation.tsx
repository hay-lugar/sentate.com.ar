"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelReservationAction } from "@/app/cuenta/actions";
import { Button } from "@/components/ui/button";
import { cancelErrorMessage } from "@/lib/account/status";

export function CancelReservation({ id, pending: isPending, cutoffHours }: { id: string; pending: boolean; cutoffHours: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await cancelReservationAction(id);
    setBusy(false);
    if (res.ok) return router.refresh();
    setError(cancelErrorMessage((res as { code?: string }).code));
    setConfirming(false);
    router.refresh();
  };

  if (!confirming) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          {isPending ? "Retirar solicitud" : "Cancelar reserva"}
        </Button>
        {!isPending && <p className="mt-2 type-help">Se puede cancelar hasta {cutoffHours} h antes de la reserva.</p>}
        {error && (
          <p role="alert" className="mt-2 text-[14px] text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div role="group" aria-label="Confirmar cancelación" className="space-y-3 rounded-xl border border-line p-4">
      <p className="text-[15px]">{isPending ? "¿Retirar esta solicitud?" : "¿Cancelar esta reserva? El local va a ver la cancelación."}</p>
      <div className="flex gap-2">
        <Button variant="danger" onClick={run} pending={busy}>
          Sí, cancelar
        </Button>
        <Button variant="quiet" onClick={() => setConfirming(false)} disabled={busy}>
          Volver
        </Button>
      </div>
    </div>
  );
}
