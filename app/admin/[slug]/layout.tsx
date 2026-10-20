import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminDemoProvider } from "@/components/admin/demo-provider";
import { getTenantRecord } from "@/lib/data/tenants";

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const tenant = getTenantRecord((await params).slug);
  return { title: tenant ? `Panel demo · ${tenant.profile.name}` : "Panel", robots: { index: false } };
}

export default async function AdminLayout({ children, params }: Props) {
  const record = getTenantRecord((await params).slug);
  if (!record) notFound();

  // key: cambiar de comercio reinicia por completo el estado de la demo.
  return (
    <AdminDemoProvider key={record.slug} record={record}>
      <AdminShell>{children}</AdminShell>
    </AdminDemoProvider>
  );
}
