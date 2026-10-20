import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicMenu } from "@/components/menu/public-menu";
import { getPublicTenant } from "@/lib/data/tenants";
import { zonedNow } from "@/lib/time/zoned";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = getPublicTenant((await params).slug);
  if (!tenant) return { title: "Local no encontrado" };
  return {
    title: `${tenant.name} — Menú y reservas (demo)`,
    description: `${tenant.tagline}. Local de ejemplo de la demo de Sentate.`,
    robots: { index: false },
  };
}

export default async function TenantPage({ params }: Props) {
  // El slug se resuelve en el server; al cliente solo viaja el contrato público.
  const tenant = getPublicTenant((await params).slug);
  if (!tenant) notFound();

  return <PublicMenu key={tenant.slug} tenant={tenant} initialNow={zonedNow(tenant.timezone)} />;
}
