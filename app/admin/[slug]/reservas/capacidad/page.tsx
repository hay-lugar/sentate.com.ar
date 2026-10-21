import Link from "next/link";
import { notFound } from "next/navigation";
import { CapacityForm } from "@/components/admin/capacity-form";
import { PageHeader } from "@/components/admin/page-header";
import { getTenantRecord } from "@/lib/data/tenants";
import { getCurrentUser, supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";

export const metadata = { title: "Capacidad y reservas" };
export const dynamic = "force-dynamic";

export default async function CapacidadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const back = (
    <Link href={`/admin/${slug}/reservas`} className="inline-flex min-h-11 items-center text-[15px] text-muted hover:text-foreground">
      ← Reservas
    </Link>
  );
  if (getTenantRecord(slug)) {
    return (
      <>
        {back}
        <PageHeader title="Capacidad y reservas" />
        <p className="max-w-xl text-[15px] text-muted">La capacidad usa datos reales y no está disponible en la demo.</p>
      </>
    );
  }
  if (!(await getCurrentUser())) notFound();
  const supabase = await supabaseServer();
  const { data: tenant, error } = await supabase.from("tenants").select("id, timezone, diner_cancel_cutoff_hours").eq("slug", slug).maybeSingle();
  if (error) throw new TemporaryDataError("capacidad");
  if (!tenant) notFound();
  const [settings, blocks] = await Promise.all([
    supabase.from("tenant_reservation_settings").select("*").eq("tenant_id", tenant.id).maybeSingle(),
    supabase.from("tenant_reservation_blocks").select("id, starts_at, ends_at, reason").eq("tenant_id", tenant.id).gte("ends_at", new Date().toISOString()).order("starts_at"),
  ]);
  if (settings.error || blocks.error) throw new TemporaryDataError("capacidad");
  const s = settings.data;
  return (
    <>
      {back}
      <PageHeader title="Capacidad y reservas" />
      <CapacityForm
        tenantId={tenant.id}
        timezone={tenant.timezone}
        blocks={blocks.data}
        initial={{
          acceptsReservations: s?.accepts_reservations ?? true,
          capacityGuests: s?.capacity_guests ?? null,
          maxPartySize: s?.max_party_size ?? 8,
          slotIntervalMinutes: (s?.slot_interval_minutes ?? 30) as 15 | 30 | 60,
          occupancyMinutes: s?.occupancy_minutes ?? 90,
          minNoticeMinutes: s?.min_notice_minutes ?? 30,
          kitchenCutoffMinutes: s?.kitchen_cutoff_minutes ?? 60,
          pendingHoldMinutes: s?.pending_hold_minutes ?? 240,
          holdPending: s?.hold_pending ?? true,
        }}
      />
    </>
  );
}
