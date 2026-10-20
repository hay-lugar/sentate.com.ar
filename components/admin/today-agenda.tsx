"use client";

import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { cn } from "@/lib/format";
import { useZonedNow } from "@/lib/hooks/use-zoned-now";
import { zonedNow } from "@/lib/time/zoned";
import { useDemo } from "./demo-provider";
import { resolveReservationTime } from "./reservation-time";

/** Línea de tiempo del servicio de hoy (confirmadas + pendientes). */
export function TodayAgenda() {
  const { state } = useDemo();
  const tz = state.profile.timezone;
  const now = useZonedNow(tz, zonedNow(tz));
  const today = state.reservations
    .filter((r) => r.dayOffset === 0 && r.status !== "rejected" && r.status !== "cancelled")
    .map((r) => ({ r, t: resolveReservationTime(r, state.profile.schedule, now) }))
    .sort((a, b) => a.t.sortKey - b.t.sortKey);

  return (
    <section className="rounded-[1.75rem] bg-surface p-5 shadow-soft ring-1 ring-line/70">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold">Servicio de hoy</h2>
        <span className="text-[13px] text-muted">{today.length} mesas</span>
      </div>

      <ol className="relative mt-5 space-y-1 before:absolute before:top-3 before:bottom-3 before:left-[3.15rem] before:w-px before:bg-line">
        {today.map(({ r, t }, i) => {
          const pending = r.status === "pending";
          return (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative flex items-center gap-4 rounded-2xl py-2"
            >
              <span className="w-10 shrink-0 text-right font-display text-[14px] font-bold tabular-nums">{r.time}</span>
              <span
                className={cn(
                  "relative z-10 size-3 shrink-0 rounded-full ring-4 ring-surface",
                  pending ? "bg-amber-400" : "bg-brand",
                )}
              />
              <div className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 py-2.5", pending ? "bg-amber-50" : "bg-background")}>
                <span className="truncate text-[14px] font-semibold">{r.name}</span>
                {t.afterMidnight && <span className="shrink-0 rounded-md bg-ink/5 px-1.5 text-[10px] font-semibold text-muted">madrugada</span>}
                <span className="sr-only">{pending ? ", solicitud pendiente" : ", confirmada"}</span>
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-muted">
                  <Users className="size-3.5" aria-hidden /> {r.guests}<span className="sr-only"> personas</span>
                </span>
              </div>
            </motion.li>
          );
        })}
        {today.length === 0 && <li className="py-6 text-center text-[14px] text-muted">Sin mesas para hoy todavía.</li>}
      </ol>

      <div className="mt-4 flex gap-4 border-t border-line/70 pt-4 text-[12px] font-medium text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand" /> Confirmada</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-400" /> Solicitud pendiente</span>
      </div>
    </section>
  );
}
