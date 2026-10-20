"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/env";

export type ReservationRequestInput = {
  tenantId: string;
  serviceDate: string;
  time: string;
  guests: number;
  name: string;
  phone: string;
  notes: string;
  idempotencyKey: string;
};

export type ReservationRequestResult =
  | { ok: true; reservationId: string; serviceDate: string; startsAt: string; replayed: boolean }
  | { ok: false; code: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Solicitud pública de mesa para un comercio real. Toda la validación de negocio vive en
 * public.request_reservation (estado forzado a pending, idempotencia, horarios, topes antiabuso).
 * Acá solo se valida la forma para no enviar basura. Usa la clave publicable: nunca service_role.
 */
export async function requestReservationAction(input: ReservationRequestInput): Promise<ReservationRequestResult> {
  if (!isSupabaseConfigured()) return { ok: false, code: "not_configured" };
  if (
    !input ||
    !UUID.test(input.tenantId) ||
    !UUID.test(input.idempotencyKey) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate) ||
    !/^\d{2}:\d{2}$/.test(input.time) ||
    !Number.isInteger(input.guests) ||
    typeof input.name !== "string" ||
    typeof input.phone !== "string" ||
    typeof input.notes !== "string" ||
    input.name.length > 200 ||
    input.phone.length > 40 ||
    input.notes.length > 1000
  ) {
    return { ok: false, code: "invalid_request" };
  }

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("request_reservation", {
    p_tenant_id: input.tenantId,
    p_service_date: input.serviceDate,
    p_time: input.time,
    p_guests: input.guests,
    p_customer_name: input.name,
    p_customer_phone: input.phone,
    p_notes: input.notes,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    // Errores de negocio: P0001 con código estable en message. El resto se reporta como genérico.
    if (error.code !== "P0001") console.error("[sentate] request_reservation", error.code, error.message);
    return { ok: false, code: error.code === "P0001" ? error.message : "unexpected" };
  }
  const res = data as { reservation_id: string; service_date: string; starts_at: string; replayed: boolean };
  return { ok: true, reservationId: res.reservation_id, serviceDate: res.service_date, startsAt: res.starts_at, replayed: res.replayed };
}
