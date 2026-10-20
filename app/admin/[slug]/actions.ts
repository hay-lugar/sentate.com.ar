"use server";

import { cookies } from "next/headers";
import { liveMutation, type MutationErrorCode, type MutationResult } from "@/lib/admin/live-mutations";
import { validateProfileInfo, validateSchedule } from "@/lib/demo/profile-validation";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";

export type { MutationResult } from "@/lib/admin/live-mutations";

type PgError = { code?: string; message?: string } | null;

const fail = (code: MutationErrorCode, message: string): MutationResult => ({ ok: false, code, message });

const MESSAGES = {
  stale: "Esto cambió en otra pestaña o dispositivo. Actualizamos los datos: revisalos y volvé a intentar.",
  forbidden: "No tenés permiso para este cambio o tu período de prueba terminó.",
  session: "Tu sesión venció. Volvé a ingresar para guardar.",
} as const;

/** Errores de Postgres/PostgREST → código estable + mensaje para el dueño. */
function describe(error: PgError): MutationResult {
  switch (error?.code) {
    case "42501":
      return fail("forbidden", MESSAGES.forbidden);
    case "PGRST301":
    case "PGRST303":
      return fail("session", MESSAGES.session);
    case "23505":
      return fail("conflict", error.message === "slug_taken" ? "Esa dirección ya está en uso." : "Ya existe un elemento con ese nombre.");
    case "23503":
      return fail("conflict", "La categoría elegida ya no existe. Actualizá la página.");
    case "23514":
      if (error.message === "invalid_status_transition") return fail("stale", "Esta solicitud ya fue respondida en otra sesión.");
      if (error.message === "shift_too_long") return fail("invalid", "Un turno dura más de 16 horas.");
      return fail("invalid", "Algún dato no es válido. Revisá el formulario.");
    case "23P01":
      return fail("invalid", "Hay turnos que se superponen (revisá también los que cruzan la medianoche).");
    case "22023":
      return fail("invalid", "La zona horaria no es válida.");
    case "P0001":
      if (error.message === "stale_write") return fail("stale", MESSAGES.stale);
      if (error.message === "invalid_schedule") return fail("invalid", "El horario no es válido.");
      return fail("invalid", "Algún dato no es válido. Revisá el formulario.");
    default:
      console.error("[sentate] mutation", error?.code, error?.message);
      return fail("error", "No se pudo guardar. Probá de nuevo.");
  }
}

/**
 * Con RLS, un UPDATE/DELETE sin permiso o con una versión vieja afecta 0 filas sin error.
 * Se distingue releyendo la fila: si sigue visible para el dueño, cambió (stale); si no, sin permiso.
 */
async function zeroRows(
  supabase: ReturnType<typeof createClient>,
  table: "menu_items" | "categories" | "reservations",
  id: string,
  tenantId: string,
): Promise<MutationResult> {
  const { data, error } = await supabase.from(table).select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) return describe(error);
  return data ? fail("stale", MESSAGES.stale) : fail("forbidden", MESSAGES.forbidden);
}

/** Publicar o despublicar el menú (columna editable por el dueño; RLS exige can_operate). */
export async function setPublishedAction(tenantId: unknown, published: unknown): Promise<MutationResult> {
  const parsed = z.object({ tenantId: z.uuid(), published: z.boolean() }).safeParse({ tenantId, published });
  if (!parsed.success) return fail("invalid", "Solicitud inválida.");
  const supabase = createClient(await cookies());
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("session", MESSAGES.session);
  const { data, error } = await supabase
    .from("tenants")
    .update({ is_published: parsed.data.published })
    .eq("id", parsed.data.tenantId)
    .select("id, updated_at");
  if (error) return describe(error);
  return data.length ? { ok: true, version: data[0].updated_at as string } : fail("forbidden", MESSAGES.forbidden);
}

/**
 * Aplica en Supabase una acción del panel. La autorización la decide RLS con la sesión del
 * usuario (can_operate): el tenantId del cliente solo identifica filas, no concede acceso.
 * Nunca usa service_role. Cada escritura lleva la versión que el panel vio (concurrencia optimista).
 */
export async function mutateTenantAction(tenantId: unknown, input: unknown): Promise<MutationResult> {
  const tenant = z.uuid().safeParse(tenantId);
  const parsed = liveMutation.safeParse(input);
  if (!tenant.success || !parsed.success) return fail("invalid", "Solicitud inválida. Actualizá la página.");
  const t = tenant.data;
  const m = parsed.data;

  const supabase = createClient(await cookies());
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("session", MESSAGES.session);

  switch (m.type) {
    case "setReservationStatus": {
      const { data, error } = await supabase
        .from("reservations")
        .update({ status: m.status })
        .eq("id", m.id)
        .eq("tenant_id", t)
        .eq("status", m.expectedStatus)
        .select("id, updated_at");
      if (error) return describe(error);
      if (!data.length) {
        const r = await zeroRows(supabase, "reservations", m.id, t);
        return !r.ok && r.code === "stale" ? fail("stale", "Esta solicitud ya fue respondida en otra sesión.") : r;
      }
      return { ok: true, version: data[0].updated_at as string };
    }

    case "saveSettings": {
      // Mismas reglas que el formulario (la base vuelve a validar superposición y duración).
      const errors = validateProfileInfo({ ...m.profile, logoUrl: m.profile.logoUrl ?? undefined });
      if (m.schedule) {
        const week = m.schedule.week.map((day, d) => day.map((s, i) => ({ id: `d${d}-${i}`, ...s })));
        Object.assign(errors, validateSchedule({ week, closures: m.schedule.closures }));
      }
      const first = Object.values(errors)[0];
      if (first) return fail("invalid", first);

      const p = m.profile;
      const { data, error } = await supabase.rpc("save_tenant_settings", {
        p_tenant_id: t,
        p_expected_version: m.expectedVersion,
        p_profile: {
          name: p.name,
          tagline: p.tagline,
          cuisine: p.cuisine,
          price_range: p.priceRange,
          address: p.address,
          phone: p.phone,
          timezone: p.timezone,
          logo_url: p.logoUrl ?? "",
          primary_color: p.theme.primary.toLowerCase(),
          primary_fg_color: p.theme.primaryForeground.toLowerCase(),
          accent_color: p.theme.accent.toLowerCase(),
          accent_fg_color: p.theme.accentForeground.toLowerCase(),
        },
        p_schedule: m.schedule,
      });
      if (error) return describe(error);
      return { ok: true, version: (data as { version: string }).version };
    }

    case "saveDish": {
      const d = m.dish;
      const row = {
        category_id: m.categoryId,
        name: d.name,
        description: d.description,
        price: d.price,
        image_url: d.image,
        tags: d.tags,
        is_available: d.active,
      };
      if (d.id) {
        if (!m.expectedVersion) return fail("invalid", "Solicitud inválida. Actualizá la página.");
        const { data, error } = await supabase
          .from("menu_items")
          .update(row)
          .eq("id", d.id)
          .eq("tenant_id", t)
          .eq("updated_at", m.expectedVersion)
          .select("id, updated_at");
        if (error) return describe(error);
        return data.length ? { ok: true, version: data[0].updated_at as string } : zeroRows(supabase, "menu_items", d.id, t);
      }
      const { count, error: countError } = await supabase
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", t)
        .eq("category_id", m.categoryId);
      if (countError) return describe(countError);
      const { data, error } = await supabase
        .from("menu_items")
        .insert({ ...row, tenant_id: t, position: count ?? 0 })
        .select("id, updated_at");
      if (error) return describe(error);
      return data.length ? { ok: true, id: data[0].id as string, version: data[0].updated_at as string } : fail("forbidden", MESSAGES.forbidden);
    }

    case "setDishActive": {
      const { data, error } = await supabase
        .from("menu_items")
        .update({ is_available: m.active })
        .eq("id", m.dishId)
        .eq("tenant_id", t)
        .eq("updated_at", m.expectedVersion)
        .select("id, updated_at");
      if (error) return describe(error);
      return data.length ? { ok: true, version: data[0].updated_at as string } : zeroRows(supabase, "menu_items", m.dishId, t);
    }

    case "deleteDish": {
      const { data, error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", m.dishId)
        .eq("tenant_id", t)
        .eq("updated_at", m.expectedVersion)
        .select("id");
      if (error) return describe(error);
      return data.length ? { ok: true } : zeroRows(supabase, "menu_items", m.dishId, t);
    }

    case "addCategory": {
      const { count, error: countError } = await supabase.from("categories").select("id", { count: "exact", head: true }).eq("tenant_id", t);
      if (countError) return describe(countError);
      const { data, error } = await supabase
        .from("categories")
        .insert({ tenant_id: t, name: m.name, position: count ?? 0 })
        .select("id, updated_at");
      if (error) return describe(error);
      return data.length ? { ok: true, id: data[0].id as string, version: data[0].updated_at as string } : fail("forbidden", MESSAGES.forbidden);
    }

    case "renameCategory": {
      const { data, error } = await supabase
        .from("categories")
        .update({ name: m.name })
        .eq("id", m.categoryId)
        .eq("tenant_id", t)
        .eq("updated_at", m.expectedVersion)
        .select("id, updated_at");
      if (error) return describe(error);
      return data.length ? { ok: true, version: data[0].updated_at as string } : zeroRows(supabase, "categories", m.categoryId, t);
    }

    case "reorderCategories": {
      const { error } = await supabase.rpc("reorder_categories", { p_tenant_id: t, p_ordered_ids: m.orderedIds });
      return error ? describe(error) : { ok: true };
    }

    case "deleteCategory": {
      const { data, error } = await supabase
        .from("categories")
        .delete()
        .eq("id", m.categoryId)
        .eq("tenant_id", t)
        .eq("updated_at", m.expectedVersion)
        .select("id");
      if (error) {
        // FK restrict: la categoría todavía tiene platos.
        if (error.code === "23503") return fail("conflict", "La categoría tiene platos. Movelos o borralos primero.");
        return describe(error);
      }
      return data.length ? { ok: true } : zeroRows(supabase, "categories", m.categoryId, t);
    }
  }
}
