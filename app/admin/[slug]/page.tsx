import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { ReservationsList } from "@/components/admin/reservations-list";
import { StatCards } from "@/components/admin/stat-cards";
import { TodayAgenda } from "@/components/admin/today-agenda";
import { getTenantRecord } from "@/lib/data/tenants";
import { formatPlainDate, zonedNow } from "@/lib/time/zoned";

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const record = getTenantRecord((await params).slug);
  if (!record) notFound();

  const now = zonedNow(record.profile.timezone);
  const hour = Math.floor(now.minutes / 60);
  const greeting = hour >= 6 && hour < 13 ? "Buen día" : hour >= 13 && hour < 20 ? "Buenas tardes" : "Buenas noches";
  const date = formatPlainDate(now.date, { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <PageHeader eyebrow={date} title={greeting}>
        <Link
          href={`/${record.slug}`}
          target="_blank"
          className="pressable inline-flex h-11 items-center gap-2 rounded-2xl bg-surface px-4 text-[14px] font-semibold shadow-soft ring-1 ring-line/70 hover:shadow-lift"
        >
          <ExternalLink className="size-4" aria-hidden /> Ver mi menú
          <span className="sr-only">(nueva pestaña)</span>
        </Link>
      </PageHeader>

      <StatCards />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <ReservationsList limit={6} seeAllHref={`/admin/${record.slug}/reservas`} />
        <TodayAgenda />
      </div>
    </>
  );
}
