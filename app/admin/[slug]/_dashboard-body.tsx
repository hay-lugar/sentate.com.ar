"use client";

import { ReservationsList } from "@/components/admin/reservations-list";
import { ReservationsOffNotice, useReservationsOff } from "@/components/admin/reservations-off";
import { StatCards } from "@/components/admin/stat-cards";
import { TodayAgenda } from "@/components/admin/today-agenda";

/** Cuerpo del inicio: con las reservas apagadas, solo la carta (sin solicitudes ni agenda vacías). */
export function DashboardBody({ slug }: { slug: string }) {
  const off = useReservationsOff();
  return (
    <>
      <StatCards />
      {off ? (
        <div className="mt-8">
          <ReservationsOffNotice slug={slug} />
        </div>
      ) : (
        <>
          <div className="mt-8">
            <ReservationsList limit={6} seeAllHref={`/admin/${slug}/reservas`} />
          </div>
          <div className="mt-8">
            <TodayAgenda />
          </div>
        </>
      )}
    </>
  );
}
