"use client";

import { useEffect, useRef, useState } from "react";
import type { Reservation } from "@/lib/domain/types";
import { RESERVATION_COLUMNS, rowToReservation, type ReservationRow } from "@/lib/data/live/mappers";
import { addDays, zonedNow } from "@/lib/time/zoned";
import { createClient } from "@/utils/supabase/client";

export type RealtimeStatus = "connecting" | "live" | "offline";

type Options = {
  tenantId: string;
  timeZone: string;
  onUpsert: (reservation: Reservation, isNew: boolean) => void;
  onResync: (reservations: Reservation[]) => void;
  /** false en la demo: no se abre ningún canal. */
  enabled?: boolean;
};

/**
 * Reservas en vivo para el panel de UN comercio.
 *
 * - Canal privado `tenant:<id>:reservations` (Broadcast desde la base). Unirse lo autoriza RLS sobre
 *   realtime.messages con la sesión del dueño (can_operate): no alcanza con conocer el tenant_id.
 * - El evento trae solo id/estado/versión: la fila se relee con la sesión (RLS de reservations).
 * - Dedupe por versión; resincroniza la lista completa al reconectar, al volver la red o la pestaña.
 * - Un único canal por comercio: se elimina al desmontar o cambiar de tenant.
 */
export function useReservationsRealtime({ tenantId, timeZone, onUpsert, onResync, enabled = true }: Options): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const handlers = useRef({ onUpsert, onResync });
  useEffect(() => {
    handlers.current = { onUpsert, onResync };
  }, [onUpsert, onResync]);

  useEffect(() => {
    if (!enabled || !tenantId) return;
    const supabase = createClient();
    const topic = `tenant:${tenantId}:reservations`;
    const seen = new Map<string, string>();
    let cancelled = false;
    let everSubscribed = false;

    const toDomain = (row: ReservationRow) => rowToReservation(row, timeZone, zonedNow(timeZone), Date.now());

    const resync = async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(RESERVATION_COLUMNS)
        .eq("tenant_id", tenantId)
        .gte("service_date", addDays(zonedNow(timeZone).date, -1))
        .order("starts_at")
        .limit(300);
      if (cancelled || error) return;
      const rows = data as ReservationRow[];
      rows.forEach((r) => seen.set(r.id, r.updated_at));
      handlers.current.onResync(rows.map(toDomain));
    };

    const fetchOne = async (id: string, version: string) => {
      const previous = seen.get(id);
      if (previous && previous >= version) return; // duplicado o desordenado
      seen.set(id, version);
      const { data, error } = await supabase
        .from("reservations")
        .select(RESERVATION_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle<ReservationRow>();
      if (cancelled || error || !data) return;
      handlers.current.onUpsert(toDomain(data), !previous);
    };

    // Evita canales duplicados (p. ej. doble montaje en desarrollo).
    for (const ch of supabase.getChannels()) if (ch.topic === `realtime:${topic}`) supabase.removeChannel(ch);

    const channel = supabase.channel(topic, { config: { private: true } });
    channel.on("broadcast", { event: "reservation_changed" }, ({ payload }) => {
      const p = payload as { id?: unknown; version?: unknown };
      if (typeof p.id === "string" && typeof p.version === "string") void fetchOne(p.id, p.version);
    });

    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel.subscribe((s) => {
        if (cancelled) return;
        if (s === "SUBSCRIBED") {
          setStatus("live");
          // Al reconectar pudo perderse algún evento: se relee la lista completa.
          if (everSubscribed) void resync();
          everSubscribed = true;
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("offline");
        }
      });
    });

    const onOnline = () => void resync();
    const onVisible = () => document.visibilityState === "visible" && void resync();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [tenantId, timeZone, enabled]);

  return status;
}
