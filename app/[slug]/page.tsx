import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicMenu } from "@/components/menu/public-menu";
import { resolvePublicTenant } from "@/lib/data/resolve";
import { BRAND } from "@/lib/config/brand";
import { appOrigin } from "@/lib/auth/app-url";
import { jsonLdString, restaurantJsonLd } from "@/lib/seo/structured-data";
import { zonedNow } from "@/lib/time/zoned";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await resolvePublicTenant((await params).slug);
  if (!resolved) return { title: "Local no encontrado" };
  const { tenant, source } = resolved;
  return source === "live"
    ? {
        alternates: { canonical: `/${tenant.slug}` },
        // Solo las fichas listadas se indexan; una carta publicada pero sin aprobar es accesible por enlace/QR y no aparece en buscadores.
        robots: tenant.discovery ? { index: true } : { index: false, follow: true },
        openGraph: { type: "website", title: tenant.name, description: tenant.tagline || undefined, url: `/${tenant.slug}`, locale: "es_AR" },
        title: tenant.reservationsEnabled === false ? `${tenant.name} — Carta` : `${tenant.name} — Carta y reservas`,
        description: tenant.tagline || `Carta${tenant.reservationsEnabled === false ? "" : " y reservas"} de ${tenant.name}.`,
      }
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

  let ld: string | null = null;
  if (source === "live") {
    try {
      const data = restaurantJsonLd(tenant, appOrigin());
      ld = data ? jsonLdString(data) : null;
    } catch {
      ld = null; // sin APP_URL no hay URL absoluta: se omiten los datos estructurados
    }
  }
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />}
      <PublicMenu key={tenant.slug} tenant={tenant} source={source} initialNow={zonedNow(tenant.timezone)} />
    </>
  );
}
