"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/env";
import { z } from "zod";
import { checkIpBudget } from "@/lib/abuse/rate-limit";
import { redact } from "@/lib/log/redact";
import { notificationsAvailable } from "@/lib/notifications/provider";

export type ReservationRequestInput = {
  tenantId: string;
  serviceDate: string;
  time: string;
  guests: number;
  name: string;
  phone: string;
  notes: string;
  idempotencyKey: string;
  email?: string;
  notifyConsent?: boolean;
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
  email: z.string().max(120).optional(),
  notifyConsent: z.boolean().optional(),
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

  // Cupo por conexión (IP), compartido entre instancias en la base. Va ANTES de la RPC de negocio. La IP no se guarda
  // ni se loguea: a la base solo llega un HMAC. Si no está bien configurado, falla cerrado (ver lib/abuse/rate-limit.ts).
  const requestHeaders = await headers();
  const gate = await checkIpBudget({
    header: (name) => requestHeaders.get(name),
    consume: async (key) => {
      const { data, error } = await supabase.rpc("consume_reservation_ip_budget", { p_key: key });
      return { data, error };
    },
    log: (message) => console.error(message),
  });
  if (!gate.ok) return { ok: false, code: gate.code };

  const { data, error } = await supabase.rpc("request_reservation", {
    p_tenant_id: req.tenantId,
    p_service_date: req.serviceDate,
    p_time: req.time,
    p_guests: req.guests,
    p_customer_name: req.name,
    p_customer_phone: req.phone,
    p_notes: req.notes,
    p_idempotency_key: req.idempotencyKey,
    // El email solo viaja con consentimiento explícito (la base lo descarta si no hay consentimiento).
    p_customer_email: req.notifyConsent ? (req.email?.trim() || null) : null,
    p_notify_consent: req.notifyConsent === true,
  });
  if (error) {
    // Errores de negocio: P0001 con código estable en message. El resto se reporta como genérico.
    if (error.code !== "P0001") console.error("[sentate] request_reservation", error.code, redact(error.message));
    return { ok: false, code: error.code === "P0001" ? error.message : "unexpected" };
  }
  const res = data as { reservation_id: string; service_date: string; starts_at: string; replayed: boolean };
  return { ok: true, reservationId: res.reservation_id, serviceDate: res.service_date, startsAt: res.starts_at, replayed: res.replayed };
}

export type LiveSlot = {
  time: string;
  starts_at: string | null;
  shift_label: string;
  after_midnight: boolean;
  available: boolean;
  reason: string | null;
};
export type LiveAvailability = { closed_reason: string | null; slots: LiveSlot[] };
export type LiveReservationConfig = { accepts_reservations: boolean; max_party_size: number; slot_interval_minutes: number; notifications: boolean };

/**
 * Disponibilidad INFORMATIVA de un día para N personas (cupo real calculado en la base). No reserva nada: el pedido
 * vuelve a validar y escribe de forma atómica, así que un horario libre acá puede estar completo al enviar.
 */
export async function reservationAvailabilityAction(tenantId: unknown, serviceDate: unknown, guests: unknown): Promise<{ ok: true; data: LiveAvailability } | { ok: false }> {
  const parsed = z
    .object({ tenantId: z.uuid(), serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), guests: z.number().int().min(1).max(50) })
    .safeParse({ tenantId, serviceDate, guests });
  if (!parsed.success || !isSupabaseConfigured()) return { ok: false };
  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("reservation_availability", {
    p_tenant_id: parsed.data.tenantId,
    p_service_date: parsed.data.serviceDate,
    p_guests: parsed.data.guests,
  });
  if (error || !data) {
    console.error("[sentate] availability", error?.code, redact(error?.message));
    return { ok: false };
  }
  return { ok: true, data: data as LiveAvailability };
}

/** Configuración pública de reservas del comercio (sin capacidad). Sin fila = valores por defecto. */
export async function reservationConfigAction(tenantId: unknown): Promise<LiveReservationConfig> {
  const notifications = notificationsAvailable();
  const fallback: LiveReservationConfig = { accepts_reservations: true, max_party_size: 8, slot_interval_minutes: 30, notifications };
  const id = z.uuid().safeParse(tenantId);
  if (!id.success || !isSupabaseConfigured()) return fallback;
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("tenant_reservation_settings")
    .select("accepts_reservations, max_party_size, slot_interval_minutes")
    .eq("tenant_id", id.data)
    .maybeSingle();
  return data ? { ...(data as Omit<LiveReservationConfig, "notifications">), notifications } : fallback;
}
