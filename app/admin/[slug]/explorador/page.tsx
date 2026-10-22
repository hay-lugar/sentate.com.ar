import { notFound } from "next/navigation";
import { ExplorerProfileForm } from "@/components/admin/explorer-profile-form";
import { PageHeader } from "@/components/admin/page-header";
import { getTenantRecord } from "@/lib/data/tenants";
import { getCurrentUser, supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import type { ModerationStatus } from "@/lib/explorer/profile";

export const metadata = { title: "Explorador" };
export const dynamic = "force-dynamic";

export default async function ExploradorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (getTenantRecord(slug)) {
    return (
      <>
        <PageHeader title="Explorador" />
        <p className="max-w-xl text-[0.9375rem] text-muted">
          El explorador usa datos reales (ubicación, moderación y aprobación), por eso no está disponible en la demo. Creá tu cuenta para configurarlo.
        </p>
      </>
    );
  }

  const user = await getCurrentUser();
  if (!user) notFound();
  const supabase = await supabaseServer();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, address, business_type, website_url, instagram_url, facebook_url, is_published")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new TemporaryDataError("explorador");
  if (!tenant) notFound();

  const [mod, loc, cui, bt, cu, pr, missing] = await Promise.all([
    supabase.from("tenant_moderation").select("status, reason, suspension_reason").eq("tenant_id", tenant.id).maybeSingle(),
    supabase.from("tenant_locations").select("lat, lng, province_code, locality, neighborhood, confirmed_at").eq("tenant_id", tenant.id).maybeSingle(),
    supabase.from("tenant_cuisines").select("cuisine_code").eq("tenant_id", tenant.id),
    supabase.from("business_types").select("code, label").order("position"),
    supabase.from("cuisines").select("code, label").order("position"),
    supabase.from("provinces").select("code, name").order("name"),
    supabase.rpc("tenant_profile_missing", { p_tenant_id: tenant.id }),
  ]);
  if (mod.error || loc.error || cui.error || bt.error || cu.error || pr.error || missing.error) throw new TemporaryDataError("explorador");

  const l = loc.data;
  return (
    <>
      <PageHeader title="Explorador" />
      <ExplorerProfileForm
        tenantId={tenant.id}
        isPublished={tenant.is_published}
        geocodingEnabled={!!process.env.GEOAPIFY_API_KEY}
        businessTypes={bt.data}
        cuisines={cu.data}
        provinces={pr.data.map((p) => ({ code: p.code, label: p.name }))}
        moderation={{
          status: (mod.data?.status ?? "draft") as ModerationStatus,
          reason: mod.data?.reason ?? "",
          suspensionReason: mod.data?.suspension_reason ?? "",
        }}
        missing={(missing.data as string[] | null) ?? []}
        initial={{
          businessType: tenant.business_type ?? "",
          cuisines: cui.data.map((c) => c.cuisine_code),
          address: tenant.address,
          provinceCode: l?.province_code ?? "",
          locality: l?.locality ?? "",
          neighborhood: l?.neighborhood ?? "",
          lat: l?.lat ?? 0,
          lng: l?.lng ?? 0,
          confirm: !!l?.confirmed_at,
          hasLocation: !!l,
          websiteUrl: tenant.website_url ?? "",
          instagramUrl: tenant.instagram_url ?? "",
          facebookUrl: tenant.facebook_url ?? "",
        }}
      />
    </>
  );
}
