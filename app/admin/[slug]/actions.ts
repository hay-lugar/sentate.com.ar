"use server";

import { cookies } from "next/headers";
import type { DemoAction } from "@/lib/demo/state";
import { validateProfile } from "@/lib/demo/profile-validation";
import { MENU_LIMITS } from "@/lib/demo/menu-validation";
import { createClient } from "@/utils/supabase/server";

export type MutationResult = { ok: true } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Errores de Postgres/PostgREST → mensaje para el dueño. */
function describe(error: { code?: string; message?: string } | null): string {
  switch (error?.code) {
    case "42501":
      return "No tenés permiso para este cambio o tu período de prueba terminó.";
    case "23505":
      return error.message === "slug_taken" ? "Esa dirección ya está en uso." : "Ya existe un elemento con ese nombre.";
    case "23503":
      return "La categoría elegida no existe.";
    case "23514":
      return error.message === "invalid_status_transition"
        ? "Ese cambio de estado no está permitido."
        : "Algún dato no es válido. Revisá el formulario.";
    case "23P01":
      return "Hay turnos que se superponen.";
    case "22023":
      return "La zona horaria no es válida.";
    default:
      return "No se pudo guardar. Probá de nuevo.";
  }
}

/** Publicar o despublicar el menú (columna editable por el dueño; RLS exige can_operate). */
export async function setPublishedAction(tenantId: string, published: boolean): Promise<MutationResult> {
  if (!UUID.test(tenantId)) return { ok: false, message: "Comercio inválido." };
  const supabase = createClient(await cookies());
  const { data, error } = await supabase.from("tenants").update({ is_published: published }).eq("id", tenantId).select("id");
  if (error) return { ok: false, message: describe(error) };
  return data?.length ? { ok: true } : { ok: false, message: describe({ code: "42501" }) };
}

/**
 * Aplica en Supabase una acción del panel. La autorización la decide RLS con la sesión del
 * usuario (can_operate): el tenantId del cliente solo identifica la fila, no concede acceso.
 * Nunca usa service_role.
 */
export async function mutateTenantAction(tenantId: string, action: DemoAction): Promise<MutationResult> {
  if (!UUID.test(tenantId)) return { ok: false, message: "Comercio inválido." };
  const supabase = createClient(await cookies());
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, message: "Tu sesión venció. Volvé a ingresar." };

  // Cuenta filas afectadas: con RLS, "0 filas" significa sin permiso (no lanza error).
  const expectOne = (res: { error: { code?: string; message?: string } | null; data: unknown[] | null }): MutationResult =>
    res.error ? { ok: false, message: describe(res.error) } : res.data?.length ? { ok: true } : { ok: false, message: describe({ code: "42501" }) };

  switch (action.type) {
    case "setReservationStatus": {
      if (!["confirmed", "rejected"].includes(action.status)) return { ok: false, message: "Estado inválido." };
      return expectOne(
        await supabase.from("reservations").update({ status: action.status }).eq("id", action.id).eq("tenant_id", tenantId).select("id"),
      );
    }

    case "updateProfile": {
      const p = action.profile;
      const errors = validateProfile(p);
      if (Object.keys(errors).length) return { ok: false, message: Object.values(errors)[0]! };
      if (p.logoUrl && !p.logoUrl.startsWith("https://")) {
        return { ok: false, message: "La subida de logos todavía no está disponible en cuentas reales." };
      }
      const res = await supabase
        .from("tenants")
        .update({
          name: p.name.trim(),
          tagline: p.tagline.trim(),
          cuisine: p.cuisine.trim(),
          price_range: p.priceRange,
          address: p.address.trim(),
          phone: p.phone.trim(),
          timezone: p.timezone,
          logo_url: p.logoUrl ?? null,
          primary_color: p.theme.primary.toLowerCase(),
          primary_fg_color: p.theme.primaryForeground.toLowerCase(),
          accent_color: p.theme.accent.toLowerCase(),
          accent_fg_color: p.theme.accentForeground.toLowerCase(),
        })
        .eq("id", tenantId)
        .select("id");
      const updated = expectOne(res);
      if (!updated.ok) return updated;
      const { error } = await supabase.rpc("replace_tenant_schedule", {
        p_tenant_id: tenantId,
        p_open_days: p.schedule.openDays,
        p_shifts: p.schedule.shifts.map((s) => ({ label: s.label.trim(), open: s.open, close: s.close })),
      });
      return error ? { ok: false, message: `Datos guardados, pero no los horarios: ${describe(error)}` } : { ok: true };
    }

    case "saveDish": {
      const d = action.dish;
      if (d.name.trim().length < MENU_LIMITS.dishNameMin || d.name.trim().length > MENU_LIMITS.dishNameMax)
        return { ok: false, message: "Revisá el nombre del plato." };
      if (!Number.isSafeInteger(d.price) || d.price < MENU_LIMITS.priceMin || d.price > MENU_LIMITS.priceMax)
        return { ok: false, message: "Revisá el precio." };
      const row = {
        category_id: action.categoryId,
        name: d.name.trim(),
        description: d.description.trim(),
        price: d.price,
        image_url: d.image || null,
        tags: d.tags,
        is_available: d.active,
      };
      if (d.id && UUID.test(d.id)) {
        return expectOne(await supabase.from("menu_items").update(row).eq("id", d.id).eq("tenant_id", tenantId).select("id"));
      }
      const { count } = await supabase
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("category_id", action.categoryId);
      return expectOne(
        await supabase.from("menu_items").insert({ ...row, tenant_id: tenantId, position: count ?? 0 }).select("id"),
      );
    }

    case "toggleDish": {
      const { data: current } = await supabase
        .from("menu_items")
        .select("is_available")
        .eq("id", action.dishId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!current) return { ok: false, message: describe({ code: "42501" }) };
      return expectOne(
        await supabase
          .from("menu_items")
          .update({ is_available: !current.is_available })
          .eq("id", action.dishId)
          .eq("tenant_id", tenantId)
          .select("id"),
      );
    }

    case "deleteDish":
      return expectOne(await supabase.from("menu_items").delete().eq("id", action.dishId).eq("tenant_id", tenantId).select("id"));

    case "addCategory": {
      const { count } = await supabase.from("categories").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      return expectOne(
        await supabase
          .from("categories")
          .insert({ tenant_id: tenantId, name: action.name.trim(), position: count ?? 0 })
          .select("id"),
      );
    }

    case "renameCategory":
      return expectOne(
        await supabase.from("categories").update({ name: action.name.trim() }).eq("id", action.categoryId).eq("tenant_id", tenantId).select("id"),
      );

    case "moveCategory": {
      const { data: rows, error } = await supabase.from("categories").select("id").eq("tenant_id", tenantId).order("position").order("name");
      if (error || !rows) return { ok: false, message: describe(error) };
      const ids = rows.map((r) => r.id as string);
      const i = ids.indexOf(action.categoryId);
      const j = i + action.direction;
      if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
      [ids[i], ids[j]] = [ids[j], ids[i]];
      // Renumera todas para normalizar posiciones (pocas filas por comercio).
      const results = await Promise.all(
        ids.map((id, position) => supabase.from("categories").update({ position }).eq("id", id).eq("tenant_id", tenantId).select("id")),
      );
      const failed = results.find((r) => r.error || !r.data?.length);
      return failed ? { ok: false, message: describe(failed.error ?? { code: "42501" }) } : { ok: true };
    }

    case "deleteCategory":
      return expectOne(await supabase.from("categories").delete().eq("id", action.categoryId).eq("tenant_id", tenantId).select("id"));

    case "hydrate":
    case "reset":
      return { ok: true };
  }
}
