"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { settingsSchema } from "@/lib/admin/capacity-schema";
import { redact } from "@/lib/log/redact";
import { createClient } from "@/utils/supabase/server";

export type CapacityResult = { ok: true; message?: string } | { ok: false; message: string };

async function session() {
  const supabase = createClient(await cookies());
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ? supabase : null;
}
const SESSION: CapacityResult = { ok: false, message: "Tu sesión venció. Volvé a ingresar." };

function describe(error: { code?: string; message?: string }): CapacityResult {
  if (error.code === "42501") return { ok: false, message: "No tenés permiso o tu período de prueba terminó." };
  if (error.code === "23514") return { ok: false, message: "Algún valor está fuera de rango. Revisá el formulario." };
  console.error("[sentate] capacidad", error.code, redact(error.message));
  return { ok: false, message: "No se pudo guardar. Probá de nuevo." };
}

export async function saveSettingsAction(tenantId: unknown, input: unknown): Promise<CapacityResult> {
  const id = z.uuid().safeParse(tenantId);
  const s = settingsSchema.safeParse(input);
  if (!id.success || !s.success) return { ok: false, message: "Revisá los valores del formulario." };
  const supabase = await session();
  if (!supabase) return SESSION;
  const v = s.data;
  const { error } = await supabase.rpc("save_reservation_settings", {
    p_tenant_id: id.data,
    p_settings: {
      accepts_reservations: v.acceptsReservations,
      capacity_guests: v.capacityGuests,
      max_party_size: v.maxPartySize,
      slot_interval_minutes: v.slotIntervalMinutes,
      occupancy_minutes: v.occupancyMinutes,
      min_notice_minutes: v.minNoticeMinutes,
      kitchen_cutoff_minutes: v.kitchenCutoffMinutes,
      pending_hold_minutes: v.pendingHoldMinutes,
      hold_pending: v.holdPending,
    },
  });
  return error ? describe(error) : { ok: true, message: "Guardado. Las reservas existentes no se modifican." };
}

export async function addBlockAction(tenantId: unknown, date: unknown, from: unknown, to: unknown, reason: unknown): Promise<CapacityResult> {
  const p = z
    .object({
      tenantId: z.uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      reason: z.string().trim().max(120),
    })
    .safeParse({ tenantId, date, from, to, reason });
  if (!p.success) return { ok: false, message: "Revisá la fecha y las horas." };
  const supabase = await session();
  if (!supabase) return SESSION;
  const { error } = await supabase.rpc("add_reservation_block", { p_tenant_id: p.data.tenantId, p_date: p.data.date, p_from: p.data.from, p_to: p.data.to, p_reason: p.data.reason });
  return error ? describe(error) : { ok: true, message: "Bloqueo agregado." };
}

export async function removeBlockAction(id: unknown): Promise<CapacityResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Solicitud inválida." };
  const supabase = await session();
  if (!supabase) return SESSION;
  const { error } = await supabase.from("tenant_reservation_blocks").delete().eq("id", parsed.data);
  return error ? describe(error) : { ok: true };
}
