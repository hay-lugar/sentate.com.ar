// Persistencia local de la demo: aislada por tenant y versionada.
// Solo guarda perfil y carta. NUNCA reservas, nombres, teléfonos ni comentarios.

import type { Category, TenantProfile } from "@/lib/domain/types";

// v2: horarios por día (Schedule.week + closures). Los datos v1 se ignoran y se vuelve al ejemplo.
export const DEMO_STORAGE_VERSION = 2;
export const demoStorageKey = (slug: string) => `sentate:demo:v${DEMO_STORAGE_VERSION}:${slug}`;

export type PersistedDemo = {
  version: typeof DEMO_STORAGE_VERSION;
  slug: string;
  savedAt: string;
  profile: TenantProfile;
  categories: Category[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const getStorage = (): StorageLike | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

function isPersistedDemo(v: unknown, slug: string): v is PersistedDemo {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === DEMO_STORAGE_VERSION &&
    o.slug === slug &&
    !!o.profile &&
    typeof o.profile === "object" &&
    Array.isArray(o.categories) &&
    typeof (o.profile as TenantProfile).name === "string" &&
    Array.isArray((o.profile as TenantProfile).schedule?.week) &&
    (o.profile as TenantProfile).schedule.week.length === 7 &&
    Array.isArray((o.profile as TenantProfile).schedule?.closures) &&
    !!(o.profile as TenantProfile).theme
  );
}

export function loadDemo(slug: string, storage: StorageLike | null = getStorage()): PersistedDemo | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(demoStorageKey(slug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPersistedDemo(parsed, slug) ? parsed : null;
  } catch {
    return null;
  }
}

/** Devuelve false si no se pudo guardar (modo privado, cuota llena, etc.). */
export function saveDemo(
  slug: string,
  data: { profile: TenantProfile; categories: Category[] },
  storage: StorageLike | null = getStorage(),
): boolean {
  if (!storage) return false;
  const payload: PersistedDemo = {
    version: DEMO_STORAGE_VERSION,
    slug,
    savedAt: new Date().toISOString(),
    profile: data.profile,
    categories: data.categories,
  };
  try {
    storage.setItem(demoStorageKey(slug), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearDemo(slug: string, storage: StorageLike | null = getStorage()) {
  try {
    storage?.removeItem(demoStorageKey(slug));
  } catch {}
}
