// Traduce una acción del panel (la misma que usa la demo) a la mutación real que viaja al servidor,
// usando el estado vigente para adjuntar las versiones vistas (concurrencia optimista). Puro y testeable.

import type { DemoAction, DemoState } from "@/lib/demo/state";
import type { TenantProfile } from "@/lib/domain/types";
import type { LiveMutation } from "./live-mutations";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const findDish = (s: DemoState, dishId: string) => s.categories.flatMap((c) => c.dishes).find((d) => d.id === dishId);

/**
 * null si la acción no tiene efecto en la base, o si refiere a algo que todavía no tiene ID real
 * (recién creado, esperando la confirmación de la base): ver `isPendingSync`.
 */
export function toLiveMutation(s: DemoState, action: DemoAction): LiveMutation | null {
  switch (action.type) {
    case "setReservationStatus": {
      const r = s.reservations.find((x) => x.id === action.id);
      if (!r || (r.status !== "pending" && r.status !== "confirmed") || action.status === "pending") return null;
      return { type: "setReservationStatus", id: r.id, status: action.status, expectedStatus: r.status };
    }
    case "saveDish": {
      const d = action.dish;
      // Categoría o plato recién creados (ID temporal): esperar a que vuelvan de la base.
      if (!UUID.test(action.categoryId) || (d.id && !UUID.test(d.id))) return null;
      const existing = d.id ? findDish(s, d.id) : undefined;
      return {
        type: "saveDish",
        categoryId: action.categoryId,
        dish: {
          id: d.id,
          name: d.name.trim(),
          description: d.description.trim(),
          price: d.price,
          image: d.image || null,
          tags: d.tags,
          active: d.active,
        },
        expectedVersion: existing?.version,
      };
    }
    case "toggleDish": {
      const d = findDish(s, action.dishId);
      return d?.version ? { type: "setDishActive", dishId: d.id, active: !d.active, expectedVersion: d.version } : null;
    }
    case "deleteDish": {
      const d = findDish(s, action.dishId);
      return d?.version ? { type: "deleteDish", dishId: d.id, expectedVersion: d.version } : null;
    }
    case "addCategory":
      return { type: "addCategory", name: action.name.trim() };
    case "renameCategory": {
      const c = s.categories.find((x) => x.id === action.categoryId);
      return c?.version ? { type: "renameCategory", categoryId: c.id, name: action.name.trim(), expectedVersion: c.version } : null;
    }
    case "moveCategory": {
      const ids = s.categories.map((c) => c.id);
      const i = ids.indexOf(action.categoryId);
      const j = i + action.direction;
      if (i < 0 || j < 0 || j >= ids.length) return null;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return ids.every((x) => UUID.test(x)) ? { type: "reorderCategories", orderedIds: ids } : null;
    }
    case "deleteCategory": {
      const c = s.categories.find((x) => x.id === action.categoryId);
      return c?.version ? { type: "deleteCategory", categoryId: c.id, expectedVersion: c.version } : null;
    }
    case "updateProfile": // Ajustes usa toSettingsMutation (necesita la versión del comercio).
    case "hydrate":
    case "reset":
    case "upsertReservation":
    case "syncReservations":
    case "confirmCreated":
      return null;
  }
}

/** Reemplaza IDs temporales (ya confirmados por la base) por los reales en una acción encolada. */
export function resolveIds(action: DemoAction, ids: ReadonlyMap<string, string>): DemoAction {
  const r = (x: string) => ids.get(x) ?? x;
  switch (action.type) {
    case "saveDish":
      return {
        ...action,
        categoryId: r(action.categoryId),
        previousCategoryId: action.previousCategoryId && r(action.previousCategoryId),
        dish: action.dish.id ? { ...action.dish, id: r(action.dish.id) } : action.dish,
      };
    case "toggleDish":
    case "deleteDish":
      return { ...action, categoryId: r(action.categoryId), dishId: r(action.dishId) };
    case "renameCategory":
    case "moveCategory":
    case "deleteCategory":
      return { ...action, categoryId: r(action.categoryId) };
    default:
      return action;
  }
}

/** La acción toca algo recién creado que todavía no volvió de la base (sin ID real o sin versión). */
export function isPendingSync(s: DemoState, action: DemoAction): boolean {
  const userEdit = ["saveDish", "toggleDish", "deleteDish", "renameCategory", "moveCategory", "deleteCategory"].includes(action.type);
  return userEdit && toLiveMutation(s, action) === null;
}

/** Ajustes: perfil + horarios (solo si cambiaron) en una sola transacción con la versión vista. */
export function toSettingsMutation(profile: TenantProfile, includeSchedule: boolean, expectedVersion: string): LiveMutation {
  return {
    type: "saveSettings",
    expectedVersion,
    profile: {
      name: profile.name.trim(),
      tagline: profile.tagline.trim(),
      cuisine: profile.cuisine.trim(),
      priceRange: profile.priceRange,
      address: profile.address.trim(),
      phone: profile.phone.trim(),
      timezone: profile.timezone,
      logoUrl: profile.logoUrl ?? null,
      theme: profile.theme,
    },
    schedule: includeSchedule
      ? {
          week: profile.schedule.week.map((day) => day.map((sh) => ({ label: sh.label.trim(), open: sh.open, close: sh.close }))),
          closures: profile.schedule.closures.map((c) => ({ date: c.date, reason: c.reason.trim() })),
        }
      : null,
  };
}
