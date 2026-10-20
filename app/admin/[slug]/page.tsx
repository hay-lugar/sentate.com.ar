import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { ReservationsList } from "@/components/admin/reservations-list";
import { StatCards } from "@/components/admin/stat-cards";
import { TodayAgenda } from "@/components/admin/today-agenda";
import { getTenant } from "@/data/mock";
import { TIMEZONE } from "@/lib/utils";

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = getTenant((await params).slug);
  if (!tenant) notFound();

  const dishes = tenant.categories.flatMap((c) => c.dishes);
  const now = new Date();
  const hour = Number(now.toLocaleString("en-US", { timeZone: TIMEZONE, hour: "numeric", hourCycle: "h23" }));
  const greeting = hour >= 6 && hour < 13 ? "Buen día" : hour >= 13 && hour < 20 ? "Buenas tardes" : "Buenas noches";
  const date = now.toLocaleDateString("es-AR", { timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <PageHeader eyebrow={date} title={<>{greeting} 👋</>}>
        <Link
          href={`/${tenant.slug}`}
          target="_blank"
          className="pressable inline-flex h-11 items-center gap-2 rounded-2xl bg-surface px-4 text-[14px] font-semibold shadow-soft ring-1 ring-line/70 hover:shadow-lift"
        >
          <ExternalLink className="size-4" /> Ver mi menú
        </Link>
      </PageHeader>

      <StatCards
        activeDishes={dishes.filter((d) => d.active).length}
        totalDishes={dishes.length}
        views={tenant.stats.menuViewsLast7}
        prevViews={tenant.stats.menuViewsPrev7Total}
      />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <ReservationsList limit={6} seeAllHref={`/admin/${tenant.slug}/reservas`} />
        <TodayAgenda />
      </div>
    </>
  );
}
