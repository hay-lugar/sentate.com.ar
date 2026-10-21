import { CapacityLink } from "@/components/admin/capacity-link";
import { PageHeader } from "@/components/admin/page-header";
import { ReservationsList } from "@/components/admin/reservations-list";
import { TodayAgenda } from "@/components/admin/today-agenda";

export const metadata = { title: "Reservas" };

export default function ReservasPage() {
  return (
    <>
      <PageHeader title="Reservas">
        <CapacityLink />
      </PageHeader>
      <ReservationsList title="Todas las solicitudes" />
      <div className="mt-10">
        <TodayAgenda />
      </div>
    </>
  );
}
