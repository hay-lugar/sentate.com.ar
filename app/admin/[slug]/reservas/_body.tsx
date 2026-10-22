"use client";

import { ReservationsList } from "@/components/admin/reservations-list";
import { ReservationsOffNotice, useReservationsOff } from "@/components/admin/reservations-off";
import { TodayAgenda } from "@/components/admin/today-agenda";

/** Con las reservas apagadas se avisa arriba y se conserva el historial (puede haber solicitudes anteriores). */
export function ReservasBody({ slug }: { slug: string }) {
  const off = useReservationsOff();
  return (
    <>
      {off && (
        <div className="mb-6">
          <ReservationsOffNotice slug={slug} compact />
        </div>
      )}
      <ReservationsList title={off ? "Historial de solicitudes" : "Todas las solicitudes"} />
      {!off && (
        <div className="mt-10">
          <TodayAgenda />
        </div>
      )}
    </>
  );
}
