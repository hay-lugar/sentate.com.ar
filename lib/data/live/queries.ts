// Consultas a Supabase en el servidor, siempre con la clave publicable y la sesión del usuario:
// la autorización la decide RLS. Nunca service_role.
//
// Cada lectura devuelve un LiveResult: un error de consulta NUNCA se convierte en datos vacíos.

import { cookies } from "next/headers";
import type { LiveTenantRecord, PublicTenant } from "@/lib/domain/types";
import { addDays, zonedNow } from "@/lib/time/zoned";
import { resolveImageRef, signImagePaths } from "@/lib/images/sign";
import { redact } from "@/lib/log/redact";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/env";
import {
  CATEGORY_COLUMNS,
  CLOSURE_COLUMNS,
  liveToPublicTenant,
  MENU_ITEM_COLUMNS,
  RESERVATION_COLUMNS,
  rowToProfile,
  rowToReservation,
  rowsToCategories,
  SHIFT_COLUMNS,
  TENANT_COLUMNS,
  type CategoryRow,
  type ClosureRow,
  type MenuItemRow,
  type ReservationRow,
  type ShiftRow,
  type TenantRow,
} from "./mappers";
import type { LiveResult } from "./result";

type QueryError = { code?: string; message: string } | null;

const fail = (where: string, error: QueryError): LiveResult<never> => {
  console.error(`[sentate] ${where}`, error?.code, redact(error?.message));
  return { status: "error", reason: where };
};

/** Fecha local de hoy menos un día: desde ayer (turnos de madrugada) en adelante. */
export const reservationsSince = (timeZone: string) => addDays(zonedNow(timeZone).date, -1);

export async function supabaseServer() {
  return createClient(await cookies());
}

/** Usuario autenticado (validado contra Auth por getClaims), o null. */
export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  return claims?.sub ? { id: claims.sub as string, email: (claims.email as string | undefined) ?? "" } : null;
}

/** Carta pública de un comercio real publicado (RLS: solo lo visible al público). */
export async function getLivePublicTenant(slug: string): Promise<LiveResult<PublicTenant>> {
  if (!isSupabaseConfigured()) return { status: "not_found" };
  const supabase = await supabaseServer();
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select(TENANT_COLUMNS)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle<TenantRow>();
  if (error) return fail("public tenant", error);
  if (!tenant) return { status: "not_found" };

  const [shifts, closures, categories, items, settings, location] = await Promise.all([
    supabase.from("tenant_shifts").select(SHIFT_COLUMNS).eq("tenant_id", tenant.id),
    supabase.from("tenant_closures").select(CLOSURE_COLUMNS).eq("tenant_id", tenant.id).gte("service_date", reservationsSince(tenant.timezone)),
    supabase.from("categories").select(CATEGORY_COLUMNS).eq("tenant_id", tenant.id).eq("is_visible", true),
    supabase.from("menu_items").select(MENU_ITEM_COLUMNS).eq("tenant_id", tenant.id).eq("is_available", true),
    // Sin fila = reservas habilitadas (comportamiento por defecto). La columna es pública por diseño.
    supabase.from("tenant_reservation_settings").select("accepts_reservations").eq("tenant_id", tenant.id).maybeSingle(),
    // RLS solo entrega la ubicación de comercios LISTADOS: su presencia es la señal para indexar la ficha.
    supabase.from("tenant_locations").select("lat, lng, locality, province_code").eq("tenant_id", tenant.id).maybeSingle(),
  ]);
  const failed = [shifts, closures, categories, items, settings, location].find((r) => r.error);
  if (failed) return fail("public menu", failed.error);

  // Las imágenes viven en un bucket privado: se firman acá (RLS limita lo firmable a la carta visible) y el resto del
  // código recibe URLs listas para mostrar. Una ruta que no se pudo firmar queda sin imagen en vez de romper la carta.
  const menuItems = items.data as MenuItemRow[];
  const signed = await signImagePaths(supabase, [tenant.logo_url, tenant.cover_url, ...menuItems.map((i) => i.image_url)]);
  const publicRow: TenantRow = {
    ...tenant,
    logo_url: resolveImageRef(signed, tenant.logo_url),
    cover_url: resolveImageRef(signed, tenant.cover_url),
  };
  const publicItems = menuItems.map((i) => ({ ...i, image_url: resolveImageRef(signed, i.image_url) }));
  return {
    status: "ok",
    data: {
      ...liveToPublicTenant(publicRow, shifts.data as ShiftRow[], categories.data as CategoryRow[], publicItems, closures.data as ClosureRow[]),
      reservationsEnabled: settings.data?.accepts_reservations ?? true,
      discovery: location.data ? { lat: location.data.lat, lng: location.data.lng, locality: location.data.locality, province: location.data.province_code } : undefined,
    },
  };
}

/** Comercios del usuario (para redirigir tras el login). */
export async function getMyTenantSlugs(): Promise<LiveResult<string[]>> {
  const supabase = await supabaseServer();
  const { data: memberships, error } = await supabase.from("tenant_members").select("tenant_id");
  if (error) return fail("memberships", error);
  const ids = memberships.map((m) => m.tenant_id as string);
  if (!ids.length) return { status: "ok", data: [] };
  const { data, error: tenantsError } = await supabase.from("tenants").select("slug, created_at").in("id", ids).order("created_at");
  if (tenantsError) return fail("my tenants", tenantsError);
  return { status: "ok", data: data.map((t) => t.slug as string) };
}

/**
 * Registro del panel para un comercio del que el usuario es miembro.
 * not_found: no existe o RLS no lo deja ver · forbidden: lo ve (publicado) pero no es miembro.
 */
export async function getLiveTenantRecord(slug: string): Promise<LiveResult<LiveTenantRecord>> {
  const supabase = await supabaseServer();
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select(TENANT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<TenantRow>();
  if (tenantError) return fail("tenant", tenantError);
  if (!tenant) return { status: "not_found" };

  const { data: access, error: accessError } = await supabase.rpc("get_tenant_access", { p_tenant_id: tenant.id });
  if (accessError) return fail("get_tenant_access", accessError);
  const accessInfo = access as { is_member: boolean; can_operate: boolean };
  if (!accessInfo.is_member) return { status: "forbidden" };

  // Marca como vencidas las solicitudes cuya retención de cupo caducó (el cupo ya se liberaba al leer; esto actualiza el estado).
  if (accessInfo.can_operate) await supabase.rpc("expire_stale_reservations", { p_tenant_id: tenant.id });

  const now = zonedNow(tenant.timezone);
  const [sub, shifts, closures, categories, items, reservations] = await Promise.all([
    supabase.from("tenant_subscriptions").select("status, trial_ends_at").eq("tenant_id", tenant.id).maybeSingle(),
    supabase.from("tenant_shifts").select(SHIFT_COLUMNS).eq("tenant_id", tenant.id),
    supabase.from("tenant_closures").select(CLOSURE_COLUMNS).eq("tenant_id", tenant.id).gte("service_date", now.date),
    supabase.from("categories").select(CATEGORY_COLUMNS).eq("tenant_id", tenant.id),
    supabase.from("menu_items").select(MENU_ITEM_COLUMNS).eq("tenant_id", tenant.id),
    // RLS devuelve [] si la prueba venció (el panel muestra AccessExpired en ese caso).
    supabase
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("tenant_id", tenant.id)
      .gte("service_date", addDays(now.date, -1))
      .order("starts_at")
      .limit(300),
  ]);
  const failed = [sub, shifts, closures, categories, items, reservations].find((r) => r.error);
  if (failed) return fail("panel data", failed.error);

  const nowMs = Date.now();
  const trialEndsAt = (sub.data?.trial_ends_at as string | undefined) ?? new Date(nowMs).toISOString();
  return {
    status: "ok",
    data: {
      id: tenant.id,
      isPublished: tenant.is_published,
      settingsVersion: tenant.updated_at,
      coverUrl: tenant.cover_url,
      slug: tenant.slug,
      profile: rowToProfile(tenant, shifts.data as ShiftRow[], closures.data as ClosureRow[]),
      categories: rowsToCategories(categories.data as CategoryRow[], items.data as MenuItemRow[]),
      reservations: (reservations.data as ReservationRow[]).map((r) => rowToReservation(r, tenant.timezone, now, nowMs)),
      stats: null,
      access: {
        subscriptionStatus: (sub.data?.status ?? "trialing") as LiveTenantRecord["access"]["subscriptionStatus"],
        trialEndsAt,
        trialDaysLeft: Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - nowMs) / 86_400_000)),
        canOperate: accessInfo.can_operate,
      },
    },
  };
}
