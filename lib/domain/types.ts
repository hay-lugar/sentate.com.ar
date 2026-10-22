// Tipos de dominio de Sentate. Sin dependencias de UI ni de fixtures.

/** Fecha calendario sin hora ni zona: "YYYY-MM-DD". */
export type PlainDate = string;
/** Hora de reloj de pared: "HH:MM" (24 h). */
export type WallTime = string;

export type DishTag = "popular" | "veggie" | "vegan" | "picante" | "sin-tacc" | "nuevo";
export const DISH_TAGS: DishTag[] = ["popular", "nuevo", "vegan", "veggie", "picante", "sin-tacc"];

/**
 * Etiquetas dietarias. Las declara el local para cada plato: NO son una certificación ni se infieren
 * (un plato «apto celíacos» no hace al local libre de gluten). Nunca se usan para clasificar al comercio entero.
 */
export const DIETARY_TAGS: DishTag[] = ["vegan", "veggie", "sin-tacc"];
export const TAG_LABELS: Record<DishTag, string> = {
  popular: "Popular",
  nuevo: "Nuevo",
  vegan: "Vegano",
  veggie: "Vegetariano",
  picante: "Picante",
  "sin-tacc": "Apto celíacos",
};
export const DIETARY_DISCLAIMER = "Etiquetas declaradas por el local, no son una certificación. Si tenés alergias o celiaquía, consultá al local antes de pedir.";

export type Dish = {
  id: string;
  name: string;
  description: string;
  /** Pesos enteros. */
  price: number;
  image?: string;
  tags: DishTag[];
  active: boolean;
  /** Marca de versión de la base (updated_at). Solo en datos reales. */
  version?: string;
};

export type Category = {
  id: string;
  name: string;
  dishes: Dish[];
  /** Marca de versión de la base (updated_at). Solo en datos reales. */
  version?: string;
};

/**
 * Un turno de servicio. Si `close <= open`, el turno cruza la medianoche y
 * sus horarios posteriores a 00:00 pertenecen a la fecha de servicio en que abrió.
 */
export type Shift = {
  id: string;
  label: string;
  open: WallTime;
  close: WallTime;
};

/** Cierre excepcional de una fecha de servicio (feriado, vacaciones, evento privado). */
export type ClosureDay = { date: PlainDate; reason: string };

export type Schedule = {
  /**
   * Turnos por día de servicio: índice 0 = domingo … 6 = sábado (siempre 7 elementos), según el día
   * en que ABRE el turno. Un día sin turnos está cerrado. Cada día puede tener turnos distintos.
   */
  week: Shift[][];
  /** Fechas de servicio cerradas excepcionalmente (prevalecen sobre `week`). */
  closures: ClosureDay[];
};

export type TenantTheme = {
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
};

/** Datos editables del comercio (Ajustes). */
export type TenantProfile = {
  name: string;
  tagline: string;
  cuisine: string;
  priceRange: "$" | "$$" | "$$$";
  address: string;
  phone: string;
  timezone: string;
  schedule: Schedule;
  theme: TenantTheme;
  /** URL o data URL. Opcional: sin logo se muestran iniciales. */
  logoUrl?: string;
  coverImage?: string;
};

/** `cancelled`: la reserva se canceló después de confirmada (o la solicitud se retiró). */
export type ReservationStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "expired" | "finished";

export type Reservation = {
  id: string;
  name: string;
  phone: string;
  guests: number;
  /** Días de servicio desde hoy (0 = hoy). Se resuelve en runtime con la zona del comercio. */
  dayOffset: number;
  time: WallTime;
  notes?: string;
  status: ReservationStatus;
  receivedMinutesAgo: number;
  /** Marca de versión de la base (updated_at). Solo en datos reales: deduplica eventos y evita pisar cambios. */
  version?: string;
};

export type TenantStats = {
  menuViewsLast7: number[];
  menuViewsPrev7Total: number;
};

/** Registro completo y privado del comercio (solo server / panel). */
export type TenantRecord = {
  slug: string;
  profile: TenantProfile;
  categories: Category[];
  reservations: Reservation[];
  /** null = sin métricas todavía (comercio real: la analítica llega en otra fase). */
  stats: TenantStats | null;
};

/** Estado comercial visible para el dueño (cuenta y futura pantalla de suscripción). */
export type TenantAccess = {
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt: string;
  /** Días restantes de prueba, calculados en el servidor al leer. */
  trialDaysLeft: number;
  /** Calculado por la base al leer (prueba/suscripción vigente). */
  canOperate: boolean;
};

/** Registro de un comercio real leído de Supabase para el panel. */
export type LiveTenantRecord = TenantRecord & {
  id: string;
  isPublished: boolean;
  access: TenantAccess;
  /** tenants.updated_at: control de concurrencia de Ajustes (perfil + horarios). */
  settingsVersion: string;
  /** tenants.cover_url: ruta de Storage o URL https. La portada se edita aparte de Ajustes (no está en el perfil). */
  coverUrl: string | null;
};

/* ───────────── Contrato público (lo único que llega al comensal) ───────────── */

export type PublicDish = Pick<Dish, "id" | "name" | "description" | "price" | "image" | "tags">;

export type PublicCategory = { id: string; name: string; dishes: PublicDish[] };

export type PublicTenant = {
  /** false = el local no recibe reservas por la web (solo carta y contacto). Ausente (demos) = habilitadas. */
  reservationsEnabled?: boolean;
  /** Solo comercios LISTADOS (aprobados, con ubicación confirmada y acceso vigente): habilita indexación y datos estructurados. */
  discovery?: { lat: number; lng: number; locality: string; province: string };
  /** UUID del comercio real (solo en datos de Supabase; las demos no tienen). */
  id?: string;
  slug: string;
  name: string;
  tagline: string;
  cuisine: string;
  priceRange: TenantProfile["priceRange"];
  address: string;
  phone: string;
  timezone: string;
  schedule: Schedule;
  theme: TenantTheme;
  logoUrl?: string;
  coverImage?: string;
  categories: PublicCategory[];
};

/** Datos mínimos para tarjetas de ejemplo en la landing. */
export type TenantSummary = Pick<PublicTenant, "slug" | "name" | "cuisine" | "theme" | "logoUrl">;
