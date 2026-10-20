"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ban, CalendarDays, Check, Clock3, Inbox, MessageSquare, Phone, Radio, Users, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Reservation, ReservationStatus } from "@/lib/domain/types";
import { cn, initials, timeAgo } from "@/lib/format";
import { useZonedNow } from "@/lib/hooks/use-zoned-now";
import { zonedNow } from "@/lib/time/zoned";
import { useDemo } from "./demo-provider";
import { resolveReservationTime } from "./reservation-time";

type Filter = ReservationStatus | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Solicitudes" },
  { id: "confirmed", label: "Confirmadas" },
  { id: "rejected", label: "Rechazadas" },
  { id: "cancelled", label: "Canceladas" },
  { id: "all", label: "Todas" },
];

export function ReservationsList({
  title = "Solicitudes y reservas",
  limit,
  seeAllHref,
}: {
  title?: string;
  limit?: number;
  seeAllHref?: string;
}) {
  const { state, mode, realtime, setReservationStatus: setStatus } = useDemo();
  const { reservations } = state;
  const tz = state.profile.timezone;
  const now = useZonedNow(tz, zonedNow(tz));
  const [filter, setFilter] = useState<Filter>("pending");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { pending: 0, confirmed: 0, rejected: 0, cancelled: 0, all: reservations.length };
    reservations.forEach((r) => c[r.status]++);
    return c;
  }, [reservations]);

  const list = useMemo(() => {
    const withTime = reservations
      .filter((r) => filter === "all" || r.status === filter)
      .map((r) => ({ r, t: resolveReservationTime(r, state.profile.schedule, now) }));
    // Pendientes: la más nueva arriba. El resto: cronológico por fecha de servicio.
    const sorted =
      filter === "pending"
        ? withTime.sort((a, b) => a.r.receivedMinutesAgo - b.r.receivedMinutesAgo)
        : withTime.sort((a, b) => a.t.sortKey - b.t.sortKey);
    return limit ? sorted.slice(0, limit) : sorted;
  }, [reservations, filter, limit, state.profile.schedule, now]);

  return (
    <section className="min-w-0 rounded-[1.75rem] bg-surface p-2 shadow-soft ring-1 ring-line/70 sm:p-3">
      <div className="flex flex-col gap-3 px-3 pt-3 pb-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-[12px] text-muted">{mode === "demo" ? "Ejemplos ficticios · pendiente ≠ confirmada" : "Una solicitud pendiente todavía no es una reserva confirmada"}</p>
          {realtime && <LiveIndicator status={realtime} />}
        </div>
        <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto rounded-2xl bg-background p-1 sm:ml-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "pressable relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold",
                filter === f.id ? "text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {filter === f.id && (
                <motion.span
                  layoutId={`filter-pill-${title}`}
                  className="absolute inset-0 rounded-xl bg-surface shadow-soft ring-1 ring-line/60"
                  transition={{ type: "spring", stiffness: 450, damping: 36 }}
                />
              )}
              <span className="relative">{f.label}</span>
              <span
                className={cn(
                  "relative rounded-md px-1.5 text-[11px] tabular-nums",
                  f.id === "pending" && counts.pending > 0 ? "bg-brand text-brand-fg" : "bg-line/70",
                )}
              >
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Encabezado tipo tabla (desktop) */}
      <div className="hidden grid-cols-[minmax(0,1.6fr)_0.6fr_1fr_minmax(0,1.4fr)_auto] gap-4 border-y border-line/70 px-4 py-2.5 text-[12px] font-semibold tracking-wide text-muted uppercase xl:grid">
        <span>Cliente</span>
        <span>Pers.</span>
        <span>Cuándo</span>
        <span>Nota</span>
        <span className="w-[15.5rem] text-right">Acción</span>
      </div>

      <ul className="divide-y divide-line/60">
        <AnimatePresence initial={false} mode="popLayout">
          {list.map(({ r, t }) => (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
            >
              <ReservationRow r={r} when={t} onAction={setStatus} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {list.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center px-6 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-background text-muted">
            <Inbox className="size-6" />
          </span>
          <p className="mt-4 font-display text-lg font-bold">Nada por acá</p>
          <p className="mt-1 text-[14px] text-muted">No hay solicitudes ni reservas en esta vista.</p>
        </motion.div>
      )}

      {seeAllHref && counts.all > (limit ?? Infinity) && (
        <Link
          href={seeAllHref}
          className="pressable mx-1 mt-1 mb-1 flex h-12 items-center justify-center rounded-2xl text-[14px] font-semibold text-brand hover:bg-brand-soft"
        >
          Ver todas las reservas
        </Link>
      )}
    </section>
  );
}

function ReservationRow({
  r,
  when,
  onAction,
}: {
  r: Reservation;
  when: ReturnType<typeof resolveReservationTime>;
  onAction: (id: string, s: ReservationStatus) => void;
}) {
  const isNew = r.status === "pending" && r.receivedMinutesAgo <= 15;

  return (
    <div className="grid gap-3 px-3 py-4 xl:grid-cols-[minmax(0,1.6fr)_0.6fr_1fr_minmax(0,1.4fr)_auto] xl:items-center xl:gap-4 xl:px-4">
      {/* Cliente */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-accent font-display text-[14px] font-bold text-accent-fg">
          {initials(r.name)}
          {isNew && <span aria-hidden className="animate-pulse-dot absolute -top-0.5 -right-0.5 size-3 rounded-full bg-brand text-brand ring-2 ring-surface" />}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="flex items-center gap-2 truncate font-semibold">
            {r.name}
            {isNew && <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand uppercase">Nueva</span>}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
            <Phone className="size-3" aria-hidden /> {r.phone}
            <span className="hidden sm:inline">· {timeAgo(r.receivedMinutesAgo)}</span>
          </p>
        </div>
      </div>

      {/* Chips (mobile) / columnas (desktop) */}
      <div className="flex flex-wrap gap-1.5 xl:contents">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-background px-2.5 py-1.5 text-[13px] font-semibold xl:w-fit">
          <Users className="size-3.5 text-muted" aria-hidden /> {r.guests}<span className="sr-only"> personas</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-background px-2.5 py-1.5 text-[13px] font-semibold xl:w-fit">
          <CalendarDays className="size-3.5 text-muted" aria-hidden /> {when.dayLabel}
          <Clock3 className="ml-1 size-3.5 text-muted" aria-hidden /> {r.time}
          {when.afterMidnight && <span className="rounded-md bg-ink/5 px-1.5 text-[11px] font-semibold text-muted">madrugada</span>}
        </span>
        <span className="contents xl:block xl:min-w-0">
          {r.notes ? (
            <span className="flex w-full items-start gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[13px] text-amber-900 xl:line-clamp-2 xl:bg-transparent xl:p-0 xl:text-muted">
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 xl:hidden" />
              {r.notes}
            </span>
          ) : (
            <span className="hidden text-[13px] text-muted xl:inline">—</span>
          )}
        </span>
      </div>

      {/* Acciones */}
      <div className="flex gap-2 xl:w-[15.5rem] xl:justify-end">
        {r.status === "pending" ? (
          <>
            <button
              type="button"
              onClick={() => onAction(r.id, "rejected")}
              className="pressable inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-background px-4 text-[14px] font-semibold text-muted ring-1 ring-line hover:bg-rose-50 hover:text-rose-600 hover:ring-rose-200 xl:flex-none"
            >
              <X className="size-4" strokeWidth={2.75} aria-hidden /> Rechazar<span className="sr-only"> solicitud de {r.name}</span>
            </button>
            <button
              type="button"
              onClick={() => onAction(r.id, "confirmed")}
              className="pressable inline-flex h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-fg shadow-brand hover:brightness-110 xl:flex-none"
            >
              <Check className="size-4" strokeWidth={2.75} aria-hidden /> Confirmar<span className="sr-only"> reserva de {r.name}</span>
            </button>
          </>
        ) : (
          <StatusBadge status={r.status} />
        )}
      </div>
    </div>
  );
}

const BADGES = {
  confirmed: { label: "Reserva confirmada", className: "bg-emerald-50 text-emerald-800", Icon: Check },
  rejected: { label: "Solicitud rechazada", className: "bg-rose-50 text-rose-700", Icon: X },
  cancelled: { label: "Cancelada", className: "bg-ink/5 text-muted", Icon: Ban },
} as const;

function StatusBadge({ status }: { status: Exclude<ReservationStatus, "pending"> }) {
  const { label, className, Icon } = BADGES[status];
  return (
    <span className={cn("inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold", className)}>
      <Icon className="size-4" strokeWidth={2.75} aria-hidden />
      {label}
    </span>
  );
}

/** Estado de la conexión en vivo: las solicitudes nuevas aparecen solas mientras está "En vivo". */
function LiveIndicator({ status }: { status: "connecting" | "live" | "offline" }) {
  return (
    <p role="status" className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold">
      {status === "live" ? (
        <>
          <Radio className="size-3.5 text-emerald-700" aria-hidden />
          <span className="text-emerald-800">En vivo</span>
        </>
      ) : status === "connecting" ? (
        <span className="text-muted">Conectando…</span>
      ) : (
        <>
          <WifiOff className="size-3.5 text-amber-800" aria-hidden />
          <span className="text-amber-900">Sin conexión en vivo · reintentando</span>
        </>
      )}
    </p>
  );
}
