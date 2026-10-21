import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicMenu } from "@/components/menu/public-menu";
import { resolvePublicTenant } from "@/lib/data/resolve";
import { BRAND } from "@/lib/config/brand";
import { zonedNow } from "@/lib/time/zoned";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await resolvePublicTenant((await params).slug);
  if (!resolved) return { title: "Local no encontrado" };
  const { tenant, source } = resolved;
  return source === "live"
    ? { title: `${tenant.name} — Menú y reservas`, description: tenant.tagline || `Menú y reservas de ${tenant.name}.` }
    : {
        title: `${tenant.name} — Menú y reservas (demo)`,
        description: `${tenant.tagline}. Local de ejemplo de la demo de ${BRAND.name}.`,
        robots: { index: false },
      };
}

export default async function TenantPage({ params }: Props) {
  // El slug se resuelve en el server; al cliente solo viaja el contrato público.
  const resolved = await resolvePublicTenant((await params).slug);
  if (!resolved) notFound();
  const { tenant, source } = resolved;

  return <PublicMenu key={tenant.slug} tenant={tenant} source={source} initialNow={zonedNow(tenant.timezone)} />;
}
