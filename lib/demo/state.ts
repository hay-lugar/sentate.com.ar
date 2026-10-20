// Estado de la demo del panel: reducer puro (testeable, sin React ni storage).

import type { Category, Dish, Reservation, ReservationStatus, TenantProfile } from "@/lib/domain/types";

export type DemoState = {
  slug: string;
  profile: TenantProfile;
  categories: Category[];
  /** Solo en memoria: nunca se persiste (contiene datos de clientes de ejemplo). */
  reservations: Reservation[];
};

export type DishInput = Omit<Dish, "id"> & { id?: string };

export type DemoAction =
  | { type: "hydrate"; profile: TenantProfile; categories: Category[] }
  | { type: "reset"; initial: DemoState }
  | { type: "setReservationStatus"; id: string; status: ReservationStatus }
  /** Realtime: alta o cambio de una reserva. Ignora versiones iguales o más viejas (dedupe). */
  | { type: "upsertReservation"; reservation: Reservation }
  /** Resincronización (p. ej. al reconectar Realtime): reemplaza la lista por la de la base. */
  | { type: "syncReservations"; reservations: Reservation[] }
  /** Modo real: la base confirmó un alta; el ID temporal del cliente pasa a ser el real. */
  | { type: "confirmCreated"; entity: "category" | "dish"; tempId: string; id: string; version?: string }
  | { type: "updateProfile"; profile: TenantProfile }
  | { type: "saveDish"; categoryId: string; dish: DishInput; previousCategoryId?: string }
  | { type: "toggleDish"; categoryId: string; dishId: string }
  | { type: "deleteDish"; categoryId: string; dishId: string }
  | { type: "addCategory"; name: string }
  | { type: "renameCategory"; categoryId: string; name: string }
  | { type: "moveCategory"; categoryId: string; direction: -1 | 1 }
  | { type: "deleteCategory"; categoryId: string };

const uid = (prefix: string, taken: Set<string>) => {
  let i = taken.size + 1;
  while (taken.has(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
};

const mapCategory = (cats: Category[], id: string, fn: (c: Category) => Category) =>
  cats.map((c) => (c.id === id ? fn(c) : c));

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "hydrate":
      return { ...state, profile: action.profile, categories: action.categories };

    case "reset":
      return structuredClone(action.initial);

    case "setReservationStatus":
      return {
        ...state,
        reservations: state.reservations.map((r) => (r.id === action.id ? { ...r, status: action.status } : r)),
      };

    case "upsertReservation": {
      const incoming = action.reservation;
      const current = state.reservations.find((r) => r.id === incoming.id);
      if (current) {
        if (current.version && incoming.version && incoming.version <= current.version) return state;
        return { ...state, reservations: state.reservations.map((r) => (r.id === incoming.id ? incoming : r)) };
      }
      return { ...state, reservations: [...state.reservations, incoming] };
    }

    case "syncReservations":
      return { ...state, reservations: action.reservations };

    case "confirmCreated": {
      const { tempId, id, version } = action;
      if (action.entity === "category") {
        return { ...state, categories: state.categories.map((c) => (c.id === tempId ? { ...c, id, version } : c)) };
      }
      return {
        ...state,
        categories: state.categories.map((c) => ({ ...c, dishes: c.dishes.map((d) => (d.id === tempId ? { ...d, id, version } : d)) })),
      };
    }

    case "updateProfile":
      return { ...state, profile: action.profile };

    case "saveDish": {
      const { categoryId, previousCategoryId } = action;
      if (!state.categories.some((c) => c.id === categoryId)) return state;
      const taken = new Set(state.categories.flatMap((c) => c.dishes.map((d) => d.id)));
      const dish: Dish = { ...action.dish, id: action.dish.id ?? uid("plato", taken) };
      const isEdit = !!action.dish.id;
      let cats = state.categories;
      if (isEdit && previousCategoryId && previousCategoryId !== categoryId) {
        cats = mapCategory(cats, previousCategoryId, (c) => ({ ...c, dishes: c.dishes.filter((d) => d.id !== dish.id) }));
        cats = mapCategory(cats, categoryId, (c) => ({ ...c, dishes: [...c.dishes, dish] }));
      } else if (isEdit) {
        cats = mapCategory(cats, categoryId, (c) => ({ ...c, dishes: c.dishes.map((d) => (d.id === dish.id ? dish : d)) }));
      } else {
        cats = mapCategory(cats, categoryId, (c) => ({ ...c, dishes: [...c.dishes, dish] }));
      }
      return { ...state, categories: cats };
    }

    case "toggleDish":
      return {
        ...state,
        categories: mapCategory(state.categories, action.categoryId, (c) => ({
          ...c,
          dishes: c.dishes.map((d) => (d.id === action.dishId ? { ...d, active: !d.active } : d)),
        })),
      };

    case "deleteDish":
      return {
        ...state,
        categories: mapCategory(state.categories, action.categoryId, (c) => ({
          ...c,
          dishes: c.dishes.filter((d) => d.id !== action.dishId),
        })),
      };

    case "addCategory": {
      const name = action.name.trim();
      if (!name) return state;
      const id = uid("categoria", new Set(state.categories.map((c) => c.id)));
      return { ...state, categories: [...state.categories, { id, name, dishes: [] }] };
    }

    case "renameCategory": {
      const name = action.name.trim();
      if (!name) return state;
      return { ...state, categories: mapCategory(state.categories, action.categoryId, (c) => ({ ...c, name })) };
    }

    case "moveCategory": {
      const i = state.categories.findIndex((c) => c.id === action.categoryId);
      const j = i + action.direction;
      if (i < 0 || j < 0 || j >= state.categories.length) return state;
      const cats = [...state.categories];
      [cats[i], cats[j]] = [cats[j], cats[i]];
      return { ...state, categories: cats };
    }

    case "deleteCategory":
      return { ...state, categories: state.categories.filter((c) => c.id !== action.categoryId) };
  }
}
