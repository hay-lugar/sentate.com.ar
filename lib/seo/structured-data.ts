import type { PublicTenant } from "@/lib/domain/types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * Datos estructurados (schema.org/Restaurant) de una ficha REAL y LISTADA. Solo usa datos públicos del contrato:
 * nada de reservas, personas ni suscripción. No se incluyen calificaciones ni métricas (no existen).
 */
export function restaurantJsonLd(tenant: PublicTenant, origin: string): Record<string, unknown> | null {
  if (!tenant.discovery) return null;
  const hours = tenant.schedule.week.flatMap((shifts, day) =>
    shifts.map((s) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: DAYS[day], opens: s.open, closes: s.close })),
  );
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: tenant.name,
    url: `${origin}/${tenant.slug}`,
    ...(tenant.tagline ? { description: tenant.tagline } : {}),
    ...(tenant.cuisine ? { servesCuisine: tenant.cuisine } : {}),
    priceRange: tenant.priceRange,
    ...(tenant.phone ? { telephone: tenant.phone } : {}),
    address: { "@type": "PostalAddress", streetAddress: tenant.address, addressLocality: tenant.discovery.locality, addressCountry: "AR" },
    geo: { "@type": "GeoCoordinates", latitude: tenant.discovery.lat, longitude: tenant.discovery.lng },
    hasMenu: `${origin}/${tenant.slug}`,
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
  };
}

/** JSON seguro para incrustar en <script>: evita cerrar la etiqueta con «</script>» o comentarios HTML. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
