import { DashboardHeader } from "@/components/admin/dashboard-header";
import { ReservationsList } from "@/components/admin/reservations-list";
import { SetupChecklist } from "@/components/admin/setup-checklist";
import { StatCards } from "@/components/admin/stat-cards";
import { TodayAgenda } from "@/components/admin/today-agenda";
import { getTenantRecord } from "@/lib/data/tenants";
import { supabaseServer } from "@/lib/data/live/queries";
import type { ChecklistInput } from "@/lib/admin/setup-checklist";
import type { ModerationStatus } from "@/lib/explorer/profile";

/** Estado de puesta en marcha de un comercio REAL (la demo no tiene). Un error de lectura omite la lista: nunca rompe el panel. */
async function loadChecklist(slug: string): Promise<ChecklistInput | null> {
  if (getTenantRecord(slug)) return null;
  try {
    const supabase = await supabaseServer();
    const { data: t } = await supabase.from("tenants").select("id, is_published, status").eq("slug", slug).maybeSingle();
    if (!t) return null;
    const [missing, mod, dishes, settings] = await Promise.all([
      supabase.rpc("tenant_profile_missing", { p_tenant_id: t.id }),
      supabase.from("tenant_moderation").select("status").eq("tenant_id", t.id).maybeSingle(),
      supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("tenant_id", t.id).eq("is_available", true),
      supabase.from("tenant_reservation_settings").select("accepts_reservations, capacity_guests").eq("tenant_id", t.id).maybeSingle(),
    ]);
    if (missing.error || mod.error || dishes.error || settings.error) return null;
    return {
      slug,
      missing: (missing.data as string[] | null) ?? [],
      dishCount: dishes.count ?? 0,
      isPublished: t.is_published,
      moderation: (mod.data?.status ?? "draft") as ModerationStatus,
      suspended: t.status === "suspended",
      acceptsReservations: settings.data?.accepts_reservations ?? true,
      capacityConfigured: settings.data?.capacity_guests != null,
    };
  } catch {
    return null;
  }
}

// El comercio ya lo resolvió el layout (demo o real); acá solo se compone la vista.
export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const checklist = await loadChecklist(slug);
  return (
    <>
      <DashboardHeader />
      {checklist && <SetupChecklist input={checklist} />}
      <StatCards />
      <div className="mt-8">
        <ReservationsList limit={6} seeAllHref={`/admin/${slug}/reservas`} />
      </div>
      <div className="mt-8">
        <TodayAgenda />
      </div>
    </>
  );
}
