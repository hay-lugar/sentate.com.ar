"use client";

import { useEffect, useRef, useState } from "react";
import type { Reservation } from "@/lib/domain/types";
import { RESERVATION_COLUMNS, rowToReservation, type ReservationRow } from "@/lib/data/live/mappers";
import { addDays, zonedNow } from "@/lib/time/zoned";
import { createClient } from "@/utils/supabase/client";
import { MAX_RESYNC_ATTEMPTS, ReservationSyncStore, retryDelay } from "./reservation-sync";

export type RealtimeStatus = "connecting" | "live" | "offline";

type Options = {
  tenantId: string;
  timeZone: string;
  onUpsert: (reservation: Reservation, isNew: boolean) => void;
  /** Devuelve false si descartó la lectura (p. ej. hay una escritura en curso): el hook la repite. */
  onResync: (reservations: Reservation[]) => boolean;
  /** false en la demo: no se abre ningún canal. */
  enabled?: boolean;
};

/**
 * Reservas en vivo para el panel de UN comercio.
 *
 * - Canal privado `tenant:<id>:reservations` (Broadcast desde la base). Unirse lo autoriza RLS sobre
 *   realtime.messages con la sesión del dueño (can_operate): no alcanza con conocer el tenant_id.
 * - El evento trae solo id/estado/versión: la fila se relee con la sesión (RLS de reservations).
 * - Resincroniza la lista completa después de cada suscripción (cubre eventos anteriores a la conexión),
 *   al volver la red o la pestaña.
 * - Una versión se da por procesada solo tras leerla bien; las lecturas fallidas se reintentan con espera.
 * - Estado en `reservation-sync.ts`: una respuesta vieja no pisa una más nueva.
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
    const store = new ReservationSyncStore<ReservationRow>();
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const toDomain = (row: ReservationRow) => rowToReservation(row, timeZone, zonedNow(timeZone), Date.now());

    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!cancelled) fn();
      }, ms);
      timers.add(t);
    };

    const resync = async (attempt = 0): Promise<void> => {
      const { data, error } = await supabase
        .from("reservations")
        .select(RESERVATION_COLUMNS)
        .eq("tenant_id", tenantId)
        .gte("service_date", addDays(zonedNow(timeZone).date, -1))
        .order("starts_at")
        .limit(300);
      if (cancelled) return;
      if (error || !data) {
        if (attempt < MAX_RESYNC_ATTEMPTS) later(() => void resync(attempt + 1), retryDelay(attempt));
        return;
      }
      const before = store.snapshot();
      const rows = store.replaceAll(data as ReservationRow[]);
      if (handlers.current.onResync(rows.map(toDomain))) return;
      // La pantalla no la tomó: se deshace y se vuelve a leer, así un evento perdido no queda sin recuperar.
      store.restore(before);
      if (attempt < MAX_RESYNC_ATTEMPTS) later(() => void resync(attempt + 1), retryDelay(attempt));
    };

    const fetchOne = async (id: string, version: string, attempt = 0): Promise<void> => {
      const { data, error } = await supabase
        .from("reservations")
        .select(RESERVATION_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle<ReservationRow>();
      if (cancelled) return;
      store.endFetch(id, version);
      if (error) {
        // La versión no se marcó como procesada: se reintenta la lectura y, si sigue fallando, se relee todo.
        if (attempt < MAX_RESYNC_ATTEMPTS) later(() => void fetchOne(id, version, attempt + 1), retryDelay(attempt));
        else void resync();
        return;
      }
      if (!data) return; // borrada o fuera del alcance RLS: nada que aplicar
      const { applied, isNew } = store.apply(data);
      if (applied) handlers.current.onUpsert(toDomain(data), isNew);
    };

    // Evita canales duplicados (p. ej. doble montaje en desarrollo).
    for (const ch of supabase.getChannels()) if (ch.topic === `realtime:${topic}`) supabase.removeChannel(ch);

    const channel = supabase.channel(topic, { config: { private: true } });
    channel.on("broadcast", { event: "reservation_changed" }, ({ payload }) => {
      const p = payload as { id?: unknown; version?: unknown };
      if (typeof p.id !== "string" || typeof p.version !== "string") return;
      if (!store.needsFetch(p.id, p.version)) return;
      store.beginFetch(p.id, p.version);
      void fetchOne(p.id, p.version);
    });

    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel.subscribe((s) => {
        if (cancelled) return;
        if (s === "SUBSCRIBED") {
          setStatus("live");
          // Cada suscripción relee la lista: cubre eventos ocurridos entre el render y la conexión.
          void resync();
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
      for (const t of timers) clearTimeout(t);
      timers.clear();
      store.reset();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [tenantId, timeZone, enabled]);

  return status;
}
