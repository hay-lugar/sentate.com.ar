// Tipos de dominio de Sentate. Sin dependencias de UI ni de fixtures.

/** Fecha calendario sin hora ni zona: "YYYY-MM-DD". */
export type PlainDate = string;
/** Hora de reloj de pared: "HH:MM" (24 h). */
export type WallTime = string;

export type DishTag = "popular" | "veggie" | "picante" | "sin-tacc" | "nuevo";
export const DISH_TAGS: DishTag[] = ["popular", "nuevo", "veggie", "picante", "sin-tacc"];

export type Dish = {
  id: string;
  name: string;
  description: string;
  /** Pesos enteros. */
  price: number;
  image?: string;
  tags: DishTag[];
  active: boolean;
};

export type Category = {
  id: string;
  name: string;
  dishes: Dish[];
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

export type Schedule = {
  /** Días de servicio abiertos (0 = domingo … 6 = sábado), según la fecha en que abre el turno. */
  openDays: number[];
  shifts: Shift[];
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

export type ReservationStatus = "pending" | "confirmed" | "rejected";

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
  stats: TenantStats;
};

/* ───────────── Contrato público (lo único que llega al comensal) ───────────── */

export type PublicDish = Pick<Dish, "id" | "name" | "description" | "price" | "image" | "tags">;

export type PublicCategory = { id: string; name: string; dishes: PublicDish[] };

export type PublicTenant = {
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
