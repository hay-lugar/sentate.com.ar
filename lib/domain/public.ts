// Proyección al contrato público. Lista PERMITIDA de campos: si se agrega un
// campo privado a TenantRecord/TenantProfile, no se filtra al comensal por accidente.

import type { Category, Dish, PublicCategory, PublicDish, PublicTenant, TenantProfile, TenantSummary } from "./types";

export function toPublicDish(d: Dish): PublicDish {
  return { id: d.id, name: d.name, description: d.description, price: d.price, image: d.image, tags: [...d.tags] };
}

/** Solo platos activos y categorías con al menos un plato visible, en el orden definido. */
export function toPublicMenu(categories: Category[]): PublicCategory[] {
  return categories
    .map((c) => ({ id: c.id, name: c.name, dishes: c.dishes.filter((d) => d.active).map(toPublicDish) }))
    .filter((c) => c.dishes.length > 0);
}

export function toPublicTenant(slug: string, profile: TenantProfile, categories: Category[]): PublicTenant {
  return {
    slug,
    name: profile.name,
    tagline: profile.tagline,
    cuisine: profile.cuisine,
    priceRange: profile.priceRange,
    address: profile.address,
    phone: profile.phone,
    timezone: profile.timezone,
    schedule: {
      openDays: [...profile.schedule.openDays],
      shifts: profile.schedule.shifts.map((s) => ({ id: s.id, label: s.label, open: s.open, close: s.close })),
    },
    theme: { ...profile.theme },
    logoUrl: profile.logoUrl,
    coverImage: profile.coverImage,
    categories: toPublicMenu(categories),
  };
}

export function toTenantSummary(slug: string, profile: TenantProfile): TenantSummary {
  return { slug, name: profile.name, cuisine: profile.cuisine, theme: { ...profile.theme }, logoUrl: profile.logoUrl };
}
