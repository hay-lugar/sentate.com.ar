import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ReservationsProvider } from "@/components/admin/reservations-provider";
import { getTenant } from "@/data/mock";
import { themeStyle } from "@/lib/utils";

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const tenant = getTenant((await params).slug);
  return { title: tenant ? `Panel · ${tenant.name}` : "Panel", robots: { index: false } };
}

export default async function AdminLayout({ children, params }: Props) {
  const tenant = getTenant((await params).slug);
  if (!tenant) notFound();

  return (
    <div style={themeStyle(tenant.theme)} className="min-h-dvh bg-background">
      <ReservationsProvider initial={tenant.reservations}>
        <AdminShell tenant={{ slug: tenant.slug, name: tenant.name, cuisine: tenant.cuisine }}>{children}</AdminShell>
      </ReservationsProvider>
    </div>
  );
}
