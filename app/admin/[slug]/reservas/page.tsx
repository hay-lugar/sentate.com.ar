import { PageHeader } from "@/components/admin/page-header";
import { ReservationsList } from "@/components/admin/reservations-list";
import { TodayAgenda } from "@/components/admin/today-agenda";

export const metadata = { title: "Reservas" };

export default function ReservasPage() {
  return (
    <>
      <PageHeader eyebrow="Gestión" title="Reservas" />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <ReservationsList title="Todas las solicitudes" />
        <TodayAgenda />
      </div>
    </>
  );
}
