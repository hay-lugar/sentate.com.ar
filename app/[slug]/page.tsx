import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MenuView } from "@/components/menu/menu-view";
import { getTenant } from "@/data/mock";
import { getOpenState, themeStyle } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = getTenant((await params).slug);
  if (!tenant) return {};
  return {
    title: `${tenant.name} — Menú y reservas`,
    description: `${tenant.tagline}. Mirá el menú y reservá tu mesa en ${tenant.name}.`,
  };
}

export default async function TenantPage({ params }: Props) {
  const tenant = getTenant((await params).slug);
  if (!tenant) notFound();

  // Solo lo público viaja al cliente: reservas y métricas quedan en el server.
  const { reservations: _r, stats: _s, ...publicTenant } = tenant;

  return (
    <div style={themeStyle(tenant.theme)} className="min-h-dvh bg-[color-mix(in_oklch,var(--brand)_7%,var(--background))]">
      <MenuView tenant={publicTenant} initialStatus={getOpenState(tenant)} />
    </div>
  );
}
