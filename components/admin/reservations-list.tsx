"use client";

import { Ban, Check, CheckCheck, Clock3, MessageCircle, Phone, Radio, Volume2, VolumeX, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Reservation, ReservationStatus } from "@/lib/domain/types";
import { Button, buttonClass } from "@/components/ui/button";
import { BRAND } from "@/lib/config/brand";
import { cn, timeAgo } from "@/lib/format";
import { playNewRequestSound, setSoundEnabled, soundEnabled } from "@/lib/admin/notify-sound";
import { useZonedNow } from "@/lib/hooks/use-zoned-now";
import { contactMessage, telLink, whatsappLink, whatsappTarget } from "@/lib/reservation/contact";
import { absoluteMinutes, zonedNow } from "@/lib/time/zoned";
import { useDemo } from "./demo-provider";
import { resolveReservationTime } from "./reservation-time";

type Filter = ReservationStatus | "all" | "today";

/** Servicio de hoy: lo que el local tiene que atender (sin rechazadas ni canceladas). */
const isToday = (r: Reservation) => r.dayOffset === 0 && r.status !== "rejected" && r.status !== "cancelled" && r.status !== "expired";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Solicitudes" },
  { id: "today", label: "Hoy" },
  { id: "confirmed", label: "Confirmadas" },
  { id: "rejected", label: "Rechazadas" },
  { id: "cancelled", label: "Canceladas" },
  { id: "finished", label: "Finalizadas" },
  { id: "expired", label: "Vencidas" },
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
    const c: Record<Filter, number> = { today: 0, pending: 0, confirmed: 0, rejected: 0, cancelled: 0, expired: 0, finished: 0, all: reservations.length };
    reservations.forEach((r) => {
      c[r.status]++;
      if (isToday(r)) c.today++;
    });
    return c;
  }, [reservations]);

  const list = useMemo(() => {
    const withTime = reservations
      .filter((r) => filter === "all" || (filter === "today" ? isToday(r) : r.status === filter))
      .map((r) => ({ r, t: resolveReservationTime(r, state.profile.schedule, now) }));
    // Pendientes: la más nueva arriba. El resto: cronológico por fecha de servicio.
    const sorted =
      filter === "pending"
        ? withTime.sort((a, b) => a.r.receivedMinutesAgo - b.r.receivedMinutesAgo)
        : withTime.sort((a, b) => a.t.sortKey - b.t.sortKey);
    return limit ? sorted.slice(0, limit) : sorted;
  }, [reservations, filter, limit, state.profile.schedule, now]);

  return (
    <section className="min-w-0" aria-labelledby="reservas-titulo">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 id="reservas-titulo" className="type-section">
            {title}
          </h2>
          <p className="mt-0.5 type-help">
            {mode === "demo" ? "Ejemplos ficticios. Una solicitud pendiente todavía no es una reserva confirmada." : "Una solicitud pendiente todavía no es una reserva confirmada."}
          </p>
          {realtime && <LiveIndicator status={realtime} />}
          {mode === "live" && <SoundToggle />}
        </div>
      </div>
      {mode === "live" && (
        <p className="mt-2 max-w-prose type-help">
          «WhatsApp» abre una conversación con un mensaje ya escrito: lo enviás vos. {BRAND.name} no manda mensajes a los comensales ni verifica el teléfono que
          dejaron.
        </p>
      )}

      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "pressable inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px]",
              filter === f.id ? "border-foreground bg-foreground font-medium text-background" : "border-line-strong text-foreground hover:bg-subtle",
            )}
          >
            {f.label}
            <span className="tabular-nums opacity-80">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {list.length > 0 ? (
        <ul className="mt-4 divide-y divide-line/70 rounded-2xl border border-line/70">
          {list.map(({ r, t }) => (
            <li key={r.id}>
              <ReservationRow r={r} tz={tz} when={t} onAction={setStatus} contact={mode === "live" ? { tenantName: state.profile.name } : undefined} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-2xl border border-line/70 px-6 py-10 text-center">
          <p className="text-[17px] font-semibold">Nada por acá</p>
          <p className="mt-1 text-[15px] text-muted">No hay solicitudes ni reservas en esta vista.</p>
        </div>
      )}

      {seeAllHref && counts.all > (limit ?? Infinity) && (
        <Link href={seeAllHref} className={buttonClass({ variant: "secondary", className: "mt-4 w-full sm:w-auto" })}>
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
  contact,
  tz,
}: {
  r: Reservation;
  tz: string;
  when: ReturnType<typeof resolveReservationTime>;
  onAction: (id: string, s: ReservationStatus) => void;
  /** Solo en modo real: la demo tiene teléfonos ficticios que podrían ser de alguien. */
  contact?: { tenantName: string };
}) {
  const isNew = r.status === "pending" && r.receivedMinutesAgo <= 15;
  const nowZ = useZonedNow(tz, zonedNow(tz));
  // Se puede finalizar una reserva confirmada desde la hora en que empieza.
  const started = when.sortKey <= absoluteMinutes(nowZ.date, nowZ.minutes);

  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-start lg:gap-6">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
          <span className="[overflow-wrap:anywhere]">{r.name}</span>
          {r.status === "pending" && <span className="rounded-md border border-line-strong px-1.5 py-1 text-[13px] leading-none font-medium">Pendiente</span>}
          {isNew && <span className="text-[13px] font-medium text-muted">Nueva</span>}
        </p>
        <p className="mt-1 type-help">
          <span className="tabular-nums">{r.phone}</span> · {timeAgo(r.receivedMinutesAgo)}
        </p>
        {contact && <ContactActions r={r} when={when} tenantName={contact.tenantName} />}
      </div>

      <div className="text-[15px]">
        <p className="font-medium">
          <span className="tabular-nums">{when.dayLabel} · {r.time}</span>
          {when.afterMidnight && <span className="font-normal text-muted"> (madrugada)</span>}
        </p>
        <p className="text-muted">
          {r.guests} {r.guests === 1 ? "persona" : "personas"}
        </p>
        {r.notes && <p className="mt-1.5 text-[14px] [overflow-wrap:anywhere] text-muted">Nota: {r.notes}</p>}
      </div>

      <div className="flex gap-2 lg:justify-end">
        {r.status === "pending" ? (
          <>
            <Button variant="secondary" onClick={() => onAction(r.id, "rejected")} className="flex-1 lg:flex-none">
              Rechazar<span className="sr-only"> solicitud de {r.name}</span>
            </Button>
            <Button onClick={() => onAction(r.id, "confirmed")} className="flex-1 lg:flex-none">
              Confirmar<span className="sr-only"> reserva de {r.name}</span>
            </Button>
          </>
        ) : r.status === "confirmed" ? (
          <>
            <StatusBadge status={r.status} />
            <Button variant="secondary" onClick={() => onAction(r.id, "cancelled")} className="lg:flex-none">
              Cancelar<span className="sr-only"> reserva de {r.name}</span>
            </Button>
            {started && (
              <Button onClick={() => onAction(r.id, "finished")} className="lg:flex-none">
                Finalizar<span className="sr-only"> reserva de {r.name}</span>
              </Button>
            )}
          </>
        ) : (
          <StatusBadge status={r.status} />
        )}
      </div>
    </div>
  );
}

/** Aviso sonoro opcional de solicitudes nuevas (apagado por defecto; se activa con un gesto de la persona). */
function SoundToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia local leída tras hidratar
    setOn(soundEnabled());
  }, []);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        setSoundEnabled(next);
        if (next) playNewRequestSound();
      }}
      className="pressable mt-1 ml-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] text-muted hover:text-foreground"
    >
      {on ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
      Sonido de solicitudes: {on ? "activado" : "desactivado"}
    </button>
  );
}

/**
 * Contacto manual con quien pidió la mesa. Los enlaces solo ABREN WhatsApp o el teléfono: nada se envía desde acá.
 * Se muestra el número exacto y, si el comensal no escribió el país, se avisa que se asumió Argentina.
 */
function ContactActions({ r, when, tenantName }: { r: Reservation; when: ReturnType<typeof resolveReservationTime>; tenantName: string }) {
  const target = whatsappTarget(r.phone);
  const text = contactMessage({ status: r.status, name: r.name, tenantName, guests: r.guests, dayLabel: when.dayLabel, time: r.time });
  const chip = buttonClass({ variant: "secondary", size: "sm" });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {target ? (
        <a href={whatsappLink(target, text)} target="_blank" rel="noopener noreferrer" className={chip}>
          <MessageCircle className="size-4" aria-hidden /> WhatsApp
          <span className="sr-only"> con {r.name} al {target.display}. Abre WhatsApp con un mensaje escrito; vos lo enviás.</span>
        </a>
      ) : null}
      <a href={telLink(r.phone)} className={chip}>
        <Phone className="size-4" aria-hidden /> Llamar<span className="sr-only"> a {r.name}</span>
      </a>
      <span className="text-[13px] leading-tight text-muted">
        {target ? (
          <>
            {target.display}
            {target.assumedCountry && " · asumimos Argentina"}
          </>
        ) : (
          "Sin enlace de WhatsApp: el número no trae el país o es ambiguo."
        )}
      </span>
    </div>
  );
}

const BADGES = {
  confirmed: { label: "Reserva confirmada", Icon: Check },
  rejected: { label: "Solicitud rechazada", Icon: X },
  cancelled: { label: "Cancelada", Icon: Ban },
  expired: { label: "Vencida sin respuesta", Icon: Clock3 },
  finished: { label: "Finalizada", Icon: CheckCheck },
} as const;

function StatusBadge({ status }: { status: Exclude<ReservationStatus, "pending"> }) {
  const { label, Icon } = BADGES[status];
  return (
    <span className="inline-flex h-10 items-center gap-1.5 text-[15px] font-medium">
      <Icon className="size-4" aria-hidden />
      {label}
    </span>
  );
}

/** Estado de la conexión en vivo: las solicitudes nuevas aparecen solas mientras está "En vivo". */
function LiveIndicator({ status }: { status: "connecting" | "live" | "offline" }) {
  return (
    <p role="status" className="mt-1 inline-flex items-center gap-1.5 type-label">
      {status === "live" ? (
        <>
          <Radio className="size-3.5 text-success" aria-hidden />
          <span className="text-success">En vivo</span>
        </>
      ) : status === "connecting" ? (
        <span className="text-muted">Conectando…</span>
      ) : (
        <>
          <WifiOff className="size-3.5 text-warning" aria-hidden />
          <span className="text-warning">Sin conexión en vivo · reintentando</span>
        </>
      )}
    </p>
  );
}
