import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessExpired } from "@/components/admin/access-expired";
import { MotionProvider } from "@/components/ui/motion-provider";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminDemoProvider } from "@/components/admin/demo-provider";
import { NoAccess } from "@/components/admin/no-access";
import { getTenantRecord } from "@/lib/data/tenants";
import { getCurrentUser, getLiveTenantRecord } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const demo = getTenantRecord(slug);
  return { title: demo ? `Panel · ${demo.profile.name}` : "Panel", robots: { index: false } };
}

/**
 * Resolución del panel:
 *  1. Slug de demo → panel demo (localStorage). Los slugs de demo están reservados en la base.
 *  2. Sin sesión → login.
 *  3. Con sesión: miembro → panel real · comercio visible pero ajeno → "sin acceso" ·
 *     inexistente → 404 · falla de la base → error boundary con "Reintentar".
 */
export default async function AdminLayout({ children, params }: Props) {
  const { slug } = await params;

  const demo = getTenantRecord(slug);
  if (demo) {
    // key: cambiar de comercio reinicia por completo el estado de la demo.
    return (
      <MotionProvider>
        <AdminDemoProvider key={`demo:${demo.slug}`} record={demo}>
          <AdminShell>{children}</AdminShell>
        </AdminDemoProvider>
      </MotionProvider>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/admin/${slug}`)}`);

  const result = await getLiveTenantRecord(slug);
  if (result.status === "error") throw new TemporaryDataError("panel");
  if (result.status === "forbidden") return <NoAccess email={user.email} />;
  if (result.status === "not_found") notFound();

  const live = result.data;
  return (
    <MotionProvider>
    <AdminDemoProvider
      key={`live:${live.id}`}
      record={live}
      live={{ tenantId: live.id, isPublished: live.isPublished, access: live.access, email: user.email, settingsVersion: live.settingsVersion, coverUrl: live.coverUrl, reservationsEnabled: live.reservationsEnabled }}
    >
      <AdminShell>{live.access.canOperate ? children : <AccessExpired access={live.access} />}</AdminShell>
    </AdminDemoProvider>
    </MotionProvider>
  );
}
