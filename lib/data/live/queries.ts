// Consultas a Supabase en el servidor, siempre con la clave publicable y la sesión del usuario:
// la autorización la decide RLS. Nunca service_role.

import { cookies } from "next/headers";
import type { LiveTenantRecord, PublicTenant } from "@/lib/domain/types";
import { addDays, zonedNow } from "@/lib/time/zoned";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/env";
import {
  liveToPublicTenant,
  rowToProfile,
  rowToReservation,
  rowsToCategories,
  type CategoryRow,
  type MenuItemRow,
  type ReservationRow,
  type ShiftRow,
  type TenantRow,
} from "./mappers";

const TENANT_COLUMNS =
  "id, slug, name, tagline, cuisine, price_range, address, phone, timezone, logo_url, cover_url, primary_color, primary_fg_color, accent_color, accent_fg_color, is_published";

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
export async function getLivePublicTenant(slug: string): Promise<PublicTenant | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await supabaseServer();
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select(TENANT_COLUMNS)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle<TenantRow>();
  if (error) {
    console.error("[sentate] getLivePublicTenant", error.message);
    return null;
  }
  if (!tenant) return null;

  const [shifts, categories, items] = await Promise.all([
    supabase.from("tenant_shifts").select("weekday, label, opens_at, closes_at").eq("tenant_id", tenant.id),
    supabase.from("categories").select("id, name, position, is_visible").eq("tenant_id", tenant.id).eq("is_visible", true),
    supabase
      .from("menu_items")
      .select("id, category_id, name, description, price, image_url, tags, is_available, position")
      .eq("tenant_id", tenant.id)
      .eq("is_available", true),
  ]);
  return liveToPublicTenant(
    tenant,
    (shifts.data ?? []) as ShiftRow[],
    (categories.data ?? []) as CategoryRow[],
    (items.data ?? []) as MenuItemRow[],
  );
}

/** ¿Existe un comercio real publicado con ese slug? (para decidir login vs. demo sin sesión) */
export async function livePublicTenantExists(slug: string) {
  if (!isSupabaseConfigured()) return false;
  const supabase = await supabaseServer();
  const { data } = await supabase.from("tenants").select("id").eq("slug", slug).eq("is_published", true).maybeSingle();
  return !!data;
}

/** Comercios del usuario (para redirigir tras el login). */
export async function getMyTenantSlugs(): Promise<string[]> {
  const supabase = await supabaseServer();
  const { data: memberships } = await supabase.from("tenant_members").select("tenant_id");
  const ids = (memberships ?? []).map((m) => m.tenant_id as string);
  if (!ids.length) return [];
  const { data } = await supabase.from("tenants").select("slug, created_at").in("id", ids).order("created_at");
  return (data ?? []).map((t) => t.slug as string);
}

/**
 * Registro del panel para un comercio del que el usuario es miembro.
 * null si no existe o el usuario no es miembro (RLS no lo deja ver).
 */
export async function getLiveTenantRecord(slug: string): Promise<LiveTenantRecord | null> {
  const supabase = await supabaseServer();
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select(TENANT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<TenantRow>();
  if (tenantError) console.error("[sentate] getLiveTenantRecord tenant", tenantError.code, tenantError.message);
  if (!tenant) return null;

  const { data: access, error: accessError } = await supabase.rpc("get_tenant_access", { p_tenant_id: tenant.id });
  if (accessError) console.error("[sentate] get_tenant_access", accessError.code, accessError.message);
  const accessInfo = access as { is_member: boolean; can_operate: boolean } | null;
  if (!accessInfo?.is_member) return null;

  const now = zonedNow(tenant.timezone);
  const [sub, shifts, categories, items, reservations] = await Promise.all([
    supabase.from("tenant_subscriptions").select("status, trial_ends_at").eq("tenant_id", tenant.id).maybeSingle(),
    supabase.from("tenant_shifts").select("weekday, label, opens_at, closes_at").eq("tenant_id", tenant.id),
    supabase.from("categories").select("id, name, position, is_visible").eq("tenant_id", tenant.id),
    supabase
      .from("menu_items")
      .select("id, category_id, name, description, price, image_url, tags, is_available, position")
      .eq("tenant_id", tenant.id),
    // Desde ayer (turnos de madrugada) en adelante; RLS devuelve [] si la prueba venció.
    supabase
      .from("reservations")
      .select("id, starts_at, service_date, guests, customer_name, customer_phone, notes, status, created_at")
      .eq("tenant_id", tenant.id)
      .gte("service_date", addDays(now.date, -1))
      .order("starts_at")
      .limit(300),
  ]);

  const nowMs = Date.now();
  const trialEndsAt = (sub.data?.trial_ends_at as string | undefined) ?? new Date(nowMs).toISOString();
  return {
    id: tenant.id,
    isPublished: tenant.is_published,
    slug: tenant.slug,
    profile: rowToProfile(tenant, (shifts.data ?? []) as ShiftRow[]),
    categories: rowsToCategories((categories.data ?? []) as CategoryRow[], (items.data ?? []) as MenuItemRow[]),
    reservations: ((reservations.data ?? []) as ReservationRow[]).map((r) => rowToReservation(r, tenant.timezone, now, nowMs)),
    stats: null,
    access: {
      subscriptionStatus: (sub.data?.status ?? "trialing") as LiveTenantRecord["access"]["subscriptionStatus"],
      trialEndsAt,
      trialDaysLeft: Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - nowMs) / 86_400_000)),
      canOperate: accessInfo.can_operate,
    },
  };
}
