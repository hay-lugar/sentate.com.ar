// Contrato de las mutaciones del panel real (cliente → Server Action), validado en RUNTIME con zod.
// Los tipos de TypeScript no protegen una Server Action: cualquiera puede invocarla con otro payload.

import { z } from "zod";
import { DISH_TAGS } from "@/lib/domain/types";
import { MENU_LIMITS } from "@/lib/demo/menu-validation";
import { PROFILE_LIMITS } from "@/lib/demo/profile-validation";
import { IMAGE_PATH_RE } from "@/lib/images/paths";

const uuid = z.uuid();
/** Marca de versión (updated_at de Postgres, ISO 8601 con zona). */
const version = z.string().min(10).max(40).refine((v) => !Number.isNaN(Date.parse(v)), "versión inválida");
const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const plainDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** URL https (demos) o ruta del bucket tenant-images. Nunca data URLs. El dueño de la ruta se valida en la acción. */
const imageRef = z.union([z.url({ protocol: /^https$/ }).max(500), z.string().regex(IMAGE_PATH_RE)]);

export const shiftInput = z.object({
  label: z.string().trim().min(1).max(PROFILE_LIMITS.shiftLabelMax),
  open: wallTime,
  close: wallTime,
});

export const scheduleInput = z.object({
  week: z.array(z.array(shiftInput).max(PROFILE_LIMITS.maxShifts)).length(7),
  closures: z
    .array(z.object({ date: plainDate, reason: z.string().trim().max(PROFILE_LIMITS.closureReasonMax) }))
    .max(PROFILE_LIMITS.maxClosures),
});

export const profileInput = z.object({
  name: z.string().trim().min(1).max(PROFILE_LIMITS.nameMax),
  tagline: z.string().trim().max(PROFILE_LIMITS.textMax),
  cuisine: z.string().trim().max(PROFILE_LIMITS.textMax),
  priceRange: z.enum(["$", "$$", "$$$"]),
  address: z.string().trim().min(1).max(PROFILE_LIMITS.textMax),
  phone: z.string().trim().min(8).max(30),
  timezone: z.string().min(1).max(64),
  logoUrl: imageRef.nullable(),
  theme: z.object({ primary: hex, primaryForeground: hex, accent: hex, accentForeground: hex }),
});

const dishInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(MENU_LIMITS.dishNameMin).max(MENU_LIMITS.dishNameMax),
  description: z.string().trim().max(MENU_LIMITS.descriptionMax),
  price: z.number().int().min(MENU_LIMITS.priceMin).max(MENU_LIMITS.priceMax),
  image: imageRef.nullable(),
  tags: z.array(z.enum(DISH_TAGS as [string, ...string[]])).max(DISH_TAGS.length),
  active: z.boolean(),
});

const categoryName = z.string().trim().min(1).max(40);

export const liveMutation = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setReservationStatus"),
    id: uuid,
    status: z.enum(["confirmed", "rejected", "cancelled", "finished", "no_show"]),
    /** Estado que el panel tenía a la vista: si cambió (otra pestaña), no se pisa. */
    expectedStatus: z.enum(["pending", "confirmed"]),
  }),
  z.object({
    type: z.literal("saveSettings"),
    expectedVersion: version,
    profile: profileInput,
    /** null = no tocar horarios. */
    schedule: scheduleInput.nullable(),
  }),
  z.object({ type: z.literal("saveCover"), expectedVersion: version, coverUrl: imageRef.nullable() }),
  z.object({ type: z.literal("saveDish"), categoryId: uuid, dish: dishInput, expectedVersion: version.optional() }),
  z.object({ type: z.literal("setDishActive"), dishId: uuid, active: z.boolean(), expectedVersion: version }),
  z.object({ type: z.literal("deleteDish"), dishId: uuid, expectedVersion: version }),
  z.object({ type: z.literal("addCategory"), name: categoryName }),
  z.object({ type: z.literal("renameCategory"), categoryId: uuid, name: categoryName, expectedVersion: version }),
  z.object({ type: z.literal("reorderCategories"), orderedIds: z.array(uuid).min(1).max(100) }),
  z.object({ type: z.literal("deleteCategory"), categoryId: uuid, expectedVersion: version }),
]);

export type LiveMutation = z.infer<typeof liveMutation>;

/**
 * stale: otra sesión cambió el dato (recargar) · forbidden: sin permiso o prueba vencida ·
 * session: sesión vencida (volver a ingresar) · invalid: datos inválidos · network/error: reintentar.
 */
export type MutationErrorCode = "stale" | "forbidden" | "session" | "invalid" | "conflict" | "network" | "error";

/** `id`: ID real de lo recién creado (categoría o plato), para reemplazar el ID temporal del cliente. */
export type MutationResult = { ok: true; version?: string; id?: string } | { ok: false; code: MutationErrorCode; message: string };
