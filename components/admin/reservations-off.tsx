"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { useDemo } from "./demo-provider";

/** True si es un comercio real que apagó las reservas (la demo siempre las tiene). */
export function useReservationsOff() {
  const { live } = useDemo();
  return !!live && !live.reservationsEnabled;
}

/** Aviso en vez de solicitudes y agenda cuando el comercio solo usa la carta. */
export function ReservationsOffNotice({ slug, compact }: { slug: string; compact?: boolean }) {
  return (
    <section className="rounded-2xl border border-line/70 bg-subtle p-4 sm:flex sm:items-center sm:gap-4" aria-labelledby="reservas-off">
      <div className="min-w-0 flex-1">
        <h2 id="reservas-off" className="text-[17px] font-semibold">
          Las reservas están desactivadas
        </h2>
        <p className="mt-0.5 type-help">
          Tu carta sigue pública y muestra tus datos de contacto para consultas. {compact ? "" : "Si más adelante querés recibir solicitudes de mesa, activalas en Capacidad."}
        </p>
      </div>
      <Link href={`/admin/${slug}/reservas/capacidad`} className={buttonClass({ variant: "secondary", className: "mt-3 w-full sm:mt-0 sm:w-auto" })}>
        {compact ? "Capacidad" : "Activar reservas"}
      </Link>
    </section>
  );
}
