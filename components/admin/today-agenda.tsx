"use client";

import { useZonedNow } from "@/lib/hooks/use-zoned-now";
import { zonedNow } from "@/lib/time/zoned";
import { useDemo } from "./demo-provider";
import { resolveReservationTime } from "./reservation-time";

/** Servicio de hoy: mesas confirmadas y solicitudes pendientes, por hora. El estado va en texto. */
export function TodayAgenda() {
  const { state } = useDemo();
  const tz = state.profile.timezone;
  const now = useZonedNow(tz, zonedNow(tz));
  const today = state.reservations
    .filter((r) => r.dayOffset === 0 && r.status !== "rejected" && r.status !== "cancelled")
    .map((r) => ({ r, t: resolveReservationTime(r, state.profile.schedule, now) }))
    .sort((a, b) => a.t.sortKey - b.t.sortKey);

  return (
    <section aria-labelledby="agenda-titulo">
      <h2 id="agenda-titulo" className="type-section">
        Servicio de hoy
      </h2>
      {today.length === 0 ? (
        <p className="mt-3 rounded-xl border border-line px-4 py-6 text-[15px] text-muted">Todavía no hay mesas para hoy.</p>
      ) : (
        <ol className="mt-3 divide-y divide-line rounded-xl border border-line">
          {today.map(({ r, t }) => (
            <li key={r.id} className="flex items-center gap-4 px-4 py-3">
              <span className="w-12 shrink-0 text-[16px] font-semibold tabular-nums">{r.time}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{r.name}</span>
                <span className="block type-help">
                  {r.guests} {r.guests === 1 ? "persona" : "personas"}
                  {t.afterMidnight ? " · madrugada" : ""}
                </span>
              </span>
              <span className="shrink-0 type-label">{r.status === "pending" ? "Pendiente" : "Confirmada"}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
