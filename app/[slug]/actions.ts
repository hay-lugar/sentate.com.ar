"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/env";
import { z } from "zod";

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

// Validación de FORMA en runtime (los tipos de TS no protegen una Server Action).
const requestSchema = z.object({
  tenantId: z.uuid(),
  idempotencyKey: z.uuid(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  guests: z.number().int().min(1).max(50),
  name: z.string().max(200),
  phone: z.string().max(40),
  notes: z.string().max(1000),
});

/**
 * Solicitud pública de mesa para un comercio real. Toda la validación de negocio vive en
 * public.request_reservation (estado forzado a pending, idempotencia, horarios, topes antiabuso).
 * Acá solo se valida la forma para no enviar basura. Usa la clave publicable: nunca service_role.
 */
export async function requestReservationAction(input: ReservationRequestInput | unknown): Promise<ReservationRequestResult> {
  if (!isSupabaseConfigured()) return { ok: false, code: "not_configured" };
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_request" };
  const req = parsed.data;

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("request_reservation", {
    p_tenant_id: req.tenantId,
    p_service_date: req.serviceDate,
    p_time: req.time,
    p_guests: req.guests,
    p_customer_name: req.name,
    p_customer_phone: req.phone,
    p_notes: req.notes,
    p_idempotency_key: req.idempotencyKey,
  });
  if (error) {
    // Errores de negocio: P0001 con código estable en message. El resto se reporta como genérico.
    if (error.code !== "P0001") console.error("[sentate] request_reservation", error.code, error.message);
    return { ok: false, code: error.code === "P0001" ? error.message : "unexpected" };
  }
  const res = data as { reservation_id: string; service_date: string; starts_at: string; replayed: boolean };
  return { ok: true, reservationId: res.reservation_id, serviceDate: res.service_date, startsAt: res.starts_at, replayed: res.replayed };
}
