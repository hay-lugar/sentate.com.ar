import { DashboardHeader } from "@/components/admin/dashboard-header";
import { ReservationsList } from "@/components/admin/reservations-list";
import { StatCards } from "@/components/admin/stat-cards";
import { TodayAgenda } from "@/components/admin/today-agenda";

// El comercio ya lo resolvió el layout (demo o real); acá solo se compone la vista.
export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <DashboardHeader />
      <StatCards />
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <ReservationsList limit={6} seeAllHref={`/admin/${slug}/reservas`} />
        <TodayAgenda />
      </div>
    </>
  );
}
