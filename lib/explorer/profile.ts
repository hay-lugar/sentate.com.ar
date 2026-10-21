import { z } from "zod";

/** Cota de seguridad: territorio argentino continental e insular austral (la base repite la regla). */
export const AR_BOUNDS = { latMin: -56, latMax: -21, lngMin: -74, lngMax: -53 } as const;
/** Vista inicial del selector cuando todavía no hay ubicación: centro del país. */
export const AR_CENTER = { lat: -34.6, lng: -64.2, zoom: 3.6 } as const;

export const inArgentina = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= AR_BOUNDS.latMin && lat <= AR_BOUNDS.latMax && lng >= AR_BOUNDS.lngMin && lng <= AR_BOUNDS.lngMax;

/** Qué falta para poder enviar a revisión (claves de private.profile_missing). */
export const MISSING_LABELS: Record<string, string> = {
  business_type: "Tipo de comercio",
  address: "Dirección",
  phone: "Teléfono del local (en Ajustes)",
  schedule: "Al menos un turno de atención (en Ajustes)",
  location: "Ubicación confirmada en el mapa",
};

export type ModerationStatus = "draft" | "pending_review" | "approved" | "rejected" | "changes_requested";

export const MODERATION_COPY: Record<ModerationStatus, { title: string; body: string }> = {
  draft: { title: "Borrador", body: "Tu comercio todavía no aparece en el explorador. Completá el perfil y enviá a revisión." },
  pending_review: { title: "En revisión", body: "Estamos revisando tu comercio. Tu carta y tus reservas siguen funcionando." },
  approved: { title: "Aprobado", body: "Tu comercio aparece en el explorador mientras tu carta esté publicada y tu acceso vigente." },
  changes_requested: { title: "Hace falta corregir algo", body: "Revisá el motivo, corregí y volvé a enviar." },
  rejected: { title: "Rechazado", body: "Tu comercio no se muestra en el explorador y tu carta pública está oculta. Si corregís lo indicado, podés volver a enviarlo." },
};

const url = (host: RegExp, label: string) =>
  z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || (/^https:\/\/[^\s]+$/.test(v) && host.test(v)), `${label} debe empezar con https:// y ser del sitio correcto.`);

export const explorerProfileSchema = z.object({
  businessType: z.string().trim().min(1, "Elegí el tipo de comercio.").max(40),
  cuisines: z.array(z.string().trim().min(1).max(40)).max(3, "Elegí hasta 3 cocinas."),
  address: z.string().trim().min(3, "Ingresá la dirección.").max(160),
  provinceCode: z.string().trim().min(1, "Elegí la provincia.").max(40),
  locality: z.string().trim().min(2, "Ingresá la localidad.").max(80),
  neighborhood: z.string().trim().max(80),
  lat: z.number().min(AR_BOUNDS.latMin, "La ubicación debe estar en Argentina.").max(AR_BOUNDS.latMax, "La ubicación debe estar en Argentina."),
  lng: z.number().min(AR_BOUNDS.lngMin, "La ubicación debe estar en Argentina.").max(AR_BOUNDS.lngMax, "La ubicación debe estar en Argentina."),
  confirm: z.boolean(),
  websiteUrl: url(/^https:\/\//, "El sitio web"),
  instagramUrl: url(/^https:\/\/(www\.)?instagram\.com\//, "Instagram"),
  facebookUrl: url(/^https:\/\/(www\.)?facebook\.com\//, "Facebook"),
});
export type ExplorerProfileInput = z.infer<typeof explorerProfileSchema>;

/** Payload de public.save_explorer_profile (claves en snake_case; '' → null en la base). */
export function toRpcPayload(p: ExplorerProfileInput) {
  return {
    business_type: p.businessType,
    cuisines: p.cuisines,
    address: p.address,
    province_code: p.provinceCode,
    locality: p.locality,
    neighborhood: p.neighborhood,
    lat: p.lat,
    lng: p.lng,
    confirm: p.confirm,
    website_url: p.websiteUrl,
    instagram_url: p.instagramUrl,
    facebook_url: p.facebookUrl,
  };
}
