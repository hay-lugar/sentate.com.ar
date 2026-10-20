import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessExpired } from "@/components/admin/access-expired";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminDemoProvider } from "@/components/admin/demo-provider";
import { getTenantRecord } from "@/lib/data/tenants";
import { getCurrentUser, getLiveTenantRecord, livePublicTenantExists } from "@/lib/data/live/queries";

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const demo = getTenantRecord(slug);
  return { title: demo ? `Panel · ${demo.profile.name}` : "Panel", robots: { index: false } };
}

/**
 * Resolución del panel:
 *  1. Con sesión y membresía en un comercio real → panel real (Supabase + RLS).
 *  2. Slug de demo sin comercio real publicado → panel demo (localStorage).
 *  3. Sin sesión → login. Con sesión sin membresía → 404.
 */
export default async function AdminLayout({ children, params }: Props) {
  const { slug } = await params;
  const user = await getCurrentUser();

  if (user) {
    const live = await getLiveTenantRecord(slug);
    if (live) {
      return (
        <AdminDemoProvider key={`live:${live.id}`} record={live} live={{ tenantId: live.id, isPublished: live.isPublished, access: live.access, email: user.email }}>
          <AdminShell>{live.access.canOperate ? children : <AccessExpired access={live.access} />}</AdminShell>
        </AdminDemoProvider>
      );
    }
  }

  const demo = getTenantRecord(slug);
  if (demo && !(await livePublicTenantExists(slug))) {
    // key: cambiar de comercio reinicia por completo el estado de la demo.
    return (
      <AdminDemoProvider key={`demo:${demo.slug}`} record={demo}>
        <AdminShell>{children}</AdminShell>
      </AdminDemoProvider>
    );
  }

  if (!user) redirect(`/login?next=${encodeURIComponent(`/admin/${slug}`)}`);
  notFound();
}
