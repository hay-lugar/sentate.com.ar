"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarDays, Check, Clock3, LoaderCircle, Minus, Phone, Plus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { addDays, cn, getTimeSlots, hashUnit } from "@/lib/utils";
import type { PublicTenant } from "./menu-view";

const MAX_GUESTS = 8;
const STEPS = ["Personas", "Fecha y hora", "Tus datos"] as const;

type Form = { guests: number; date: Date | null; time: string | null; name: string; phone: string; notes: string };
const EMPTY: Form = { guests: 2, date: null, time: null, name: "", phone: "", notes: "" };

// Fechas locales del dispositivo del comensal (sin forzar TZ, para no correr el día)
const fmtDay = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("es-AR", opts);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ReservationFlow({ tenant, open, onClose }: { tenant: PublicTenant; open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState<Form>(EMPTY);
  const [phase, setPhase] = useState<"form" | "sending" | "done">("form");

  // Reset al cerrar (después de la animación de salida)
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setStep(0);
      setForm(EMPTY);
      setPhase("form");
    }, 350);
    return () => clearTimeout(t);
  }, [open]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const canContinue = [
    form.guests >= 1 && form.guests <= MAX_GUESTS,
    !!form.date && !!form.time,
    form.name.trim().length >= 2 && form.phone.replace(/\D/g, "").length >= 8,
  ][step];

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1);
    setStep(to);
  };

  const submit = () => {
    setPhase("sending");
    // Mock: sin backend. En Fase 2 esto será un server action contra Supabase.
    setTimeout(() => setPhase("done"), 1300);
  };

  const header =
    phase === "done" ? null : (
      <div>
        <p className="text-[12px] font-semibold tracking-wide text-brand uppercase">
          Paso {step + 1} de {STEPS.length}
        </p>
        <h2 className="mt-0.5 text-[22px] font-bold">{["¿Cuántos son?", "¿Cuándo vienen?", "Último paso"][step]}</h2>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={false}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <BottomSheet open={open} onClose={onClose} label="Reservar mesa" header={header}>
      {phase === "done" ? (
        <Success tenant={tenant} form={form} onClose={onClose} />
      ) : (
        <div className="flex min-h-[26rem] flex-col">
          <div className="relative flex-1 overflow-x-hidden">
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={{
                  enter: (d: number) => ({ x: d * 48, opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit: (d: number) => ({ x: d * -48, opacity: 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
                className="px-6 pt-4 pb-6"
              >
                {step === 0 && <GuestsStep guests={form.guests} onChange={(g) => set("guests", g)} phone={tenant.phone} />}
                {step === 1 && (
                  <DateTimeStep
                    tenant={tenant}
                    guests={form.guests}
                    date={form.date}
                    time={form.time}
                    onDate={(d) => setForm((f) => ({ ...f, date: d, time: null }))}
                    onTime={(t) => set("time", t)}
                  />
                )}
                {step === 2 && <DetailsStep form={form} set={set} onEdit={go} />}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="sticky bottom-0 flex gap-3 border-t border-line/70 bg-surface/95 px-6 pt-4 pb-safe backdrop-blur">
            {step > 0 && (
              <button
                type="button"
                onClick={() => go(step - 1)}
                aria-label="Volver"
                className="pressable grid size-14 shrink-0 place-items-center rounded-2xl bg-background text-foreground ring-1 ring-line"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <button
              type="button"
              disabled={!canContinue || phase === "sending"}
              onClick={() => (step < STEPS.length - 1 ? go(step + 1) : submit())}
              className={cn(
                "pressable flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl font-display text-[16px] font-bold",
                "bg-brand text-brand-fg shadow-brand disabled:bg-line disabled:text-muted disabled:shadow-none disabled:active:scale-100",
              )}
            >
              {phase === "sending" ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" /> Enviando…
                </>
              ) : step < STEPS.length - 1 ? (
                "Continuar"
              ) : (
                "Confirmar reserva"
              )}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

/* ───────────────────────── Paso 1 ───────────────────────── */

function GuestsStep({ guests, onChange, phone }: { guests: number; onChange: (n: number) => void; phone: string }) {
  return (
    <div>
      <div className="flex items-center justify-between rounded-3xl bg-background p-3 ring-1 ring-line/70">
        <StepperButton label="Menos" disabled={guests <= 1} onClick={() => onChange(guests - 1)}>
          <Minus className="size-5" strokeWidth={2.75} />
        </StepperButton>
        <div className="text-center">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={guests}
              initial={{ y: 14, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -14, opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="block font-display text-6xl leading-none font-bold tabular-nums"
            >
              {guests}
            </motion.span>
          </AnimatePresence>
          <span className="mt-1 block text-[13px] font-medium text-muted">{guests === 1 ? "persona" : "personas"}</span>
        </div>
        <StepperButton label="Más" disabled={guests >= MAX_GUESTS} onClick={() => onChange(guests + 1)}>
          <Plus className="size-5" strokeWidth={2.75} />
        </StepperButton>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {Array.from({ length: MAX_GUESTS }, (_, i) => i + 1).map((n) => (
          <Chip key={n} selected={guests === n} onClick={() => onChange(n)} className="h-12 text-[15px]">
            {n}
          </Chip>
        ))}
      </div>

      <a
        href={`tel:${phone.replace(/\s|-/g, "")}`}
        className="pressable mt-5 flex items-center gap-3 rounded-2xl bg-accent p-4 text-accent-fg"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/60">
          <Users className="size-[18px]" />
        </span>
        <span className="text-[13px] leading-snug">
          <b className="font-semibold">¿Son más de {MAX_GUESTS}?</b> Llamanos y armamos la mesa juntos.
        </span>
        <Phone className="ml-auto size-4 shrink-0" />
      </a>
    </div>
  );
}

function StepperButton({ children, label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="pressable grid size-14 place-items-center rounded-2xl bg-surface text-foreground shadow-soft ring-1 ring-line/70 disabled:opacity-35 disabled:active:scale-100"
      {...props}
    >
      {children}
    </button>
  );
}

/* ───────────────────────── Paso 2 ───────────────────────── */

function DateTimeStep({
  tenant,
  guests,
  date,
  time,
  onDate,
  onTime,
}: {
  tenant: PublicTenant;
  guests: number;
  date: Date | null;
  time: string | null;
  onDate: (d: Date) => void;
  onTime: (t: string) => void;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const slots = useMemo(() => getTimeSlots(tenant.hours), [tenant.hours]);

  const isClosed = (d: Date) => tenant.closedDays.includes(d.getDay());

  const slotState = (slot: string) => {
    if (!date) return "free";
    const [h, m] = slot.split(":").map(Number);
    if (sameDay(date, today)) {
      const now = new Date();
      // Los turnos post-medianoche pertenecen al mismo día de servicio
      const slotMinutes = (h < 6 ? h + 24 : h) * 60 + m;
      if (slotMinutes < now.getHours() * 60 + now.getMinutes() + 30) return "past";
    }
    return hashUnit(`${tenant.slug}${date.toDateString()}${slot}${guests}`) < 0.24 ? "full" : "free";
  };

  const groups = [
    { label: "Almuerzo", items: slots.filter((s) => +s.slice(0, 2) >= 6 && +s.slice(0, 2) < 17) },
    { label: "Cena", items: slots.filter((s) => +s.slice(0, 2) >= 17 || +s.slice(0, 2) < 6) },
  ].filter((g) => g.items.length);

  return (
    <div>
      <SectionLabel icon={CalendarDays}>Elegí el día</SectionLabel>
      <div className="no-scrollbar -mx-6 flex snap-x gap-2 overflow-x-auto px-6 pb-1">
        {days.map((d, i) => {
          const closed = isClosed(d);
          const selected = !!date && sameDay(d, date);
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={closed}
              onClick={() => onDate(d)}
              className={cn(
                "pressable flex w-[4.25rem] shrink-0 snap-start flex-col items-center rounded-2xl py-3 ring-1",
                selected
                  ? "bg-brand text-brand-fg shadow-brand ring-brand"
                  : "bg-surface ring-line hover:ring-foreground/20",
                closed && "opacity-40 active:scale-100",
              )}
            >
              <span className={cn("text-[11px] font-semibold uppercase", selected ? "opacity-85" : "text-muted")}>
                {i === 0 ? "Hoy" : i === 1 ? "Mañ" : fmtDay(d, { weekday: "short" }).replace(".", "")}
              </span>
              <span className="mt-0.5 font-display text-[22px] leading-tight font-bold">{d.getDate()}</span>
              <span className={cn("text-[11px] font-medium", selected ? "opacity-85" : "text-muted")}>
                {closed ? "Cerrado" : fmtDay(d, { month: "short" }).replace(".", "")}
              </span>
            </button>
          );
        })}
      </div>

      <SectionLabel icon={Clock3} className="mt-6">
        Elegí el horario
      </SectionLabel>
      {!date ? (
        <div className="grid h-36 place-items-center rounded-3xl border-2 border-dashed border-line text-[14px] text-muted">
          Primero elegí un día 👆
        </div>
      ) : (
        <motion.div key={date.toDateString()} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-[12px] font-semibold text-muted">{g.label}</p>
              <div className="grid grid-cols-4 gap-2">
                {g.items.map((slot) => {
                  const state = slotState(slot);
                  return (
                    <Chip
                      key={slot}
                      selected={time === slot}
                      disabled={state !== "free"}
                      onClick={() => onTime(slot)}
                      className={cn("h-11 text-[14px] tabular-nums", state !== "free" && "line-through")}
                    >
                      {slot}
                    </Chip>
                  );
                })}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

/* ───────────────────────── Paso 3 ───────────────────────── */

function DetailsStep({
  form,
  set,
  onEdit,
}: {
  form: Form;
  set: <K extends keyof Form>(key: K, value: Form[K]) => void;
  onEdit: (step: number) => void;
}) {
  return (
    <div>
      <div className="flex divide-x divide-line rounded-3xl bg-background ring-1 ring-line/70">
        <SummaryItem label="Personas" value={String(form.guests)} onClick={() => onEdit(0)} />
        <SummaryItem
          label="Día"
          value={form.date ? capitalize(fmtDay(form.date, { weekday: "short", day: "numeric" }).replace(".", "")) : "—"}
          onClick={() => onEdit(1)}
        />
        <SummaryItem label="Hora" value={form.time ?? "—"} onClick={() => onEdit(1)} />
      </div>

      <div className="mt-5 space-y-3">
        <Field label="Nombre y apellido">
          <input
            autoComplete="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ej: Martina Gómez"
            className={inputClass}
          />
        </Field>
        <Field label="Celular (WhatsApp)" hint="Te avisamos por acá cuando el local confirme.">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="11 5555-5555"
            className={inputClass}
          />
        </Field>
        <Field label="Comentarios" optional>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Cumpleaños, silla de bebé, alergias…"
            className={cn(inputClass, "h-auto resize-none py-3.5")}
          />
        </Field>
      </div>
    </div>
  );
}

const inputClass =
  "h-14 w-full rounded-2xl bg-background px-4 text-[16px] text-foreground ring-1 ring-line outline-none transition-shadow placeholder:text-muted/60 focus:bg-surface focus:ring-2 focus:ring-brand";

function Field({ label, hint, optional, children }: { label: string; hint?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between px-1 text-[13px] font-semibold">
        {label}
        {optional && <span className="text-[12px] font-medium text-muted">Opcional</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block px-1 text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

function SummaryItem({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="pressable flex-1 px-3 py-3 text-center">
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className="mt-0.5 block font-display text-[17px] font-bold">{value}</span>
      <span className="block text-[11px] font-semibold text-brand">Cambiar</span>
    </button>
  );
}

/* ───────────────────────── Éxito ───────────────────────── */

function Success({ tenant, form, onClose }: { tenant: PublicTenant; form: Form; onClose: () => void }) {
  const firstName = form.name.trim().split(" ")[0];
  return (
    <div className="px-6 pb-safe text-center">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="mx-auto grid size-20 place-items-center rounded-full bg-brand text-brand-fg shadow-brand"
      >
        <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.45, ease: "easeOut" }} />
        </svg>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h2 className="mt-5 text-[26px] font-bold">¡Listo, {firstName}!</h2>
        <p className="mx-auto mt-1.5 max-w-[18rem] text-[14px] text-muted">
          Tu solicitud llegó a {tenant.name}. Te confirmamos por WhatsApp en unos minutos.
        </p>

        {/* Ticket */}
        <div className="relative mt-6 rounded-3xl bg-background p-5 text-left ring-1 ring-line/70">
          <div className="flex items-center justify-between">
            <span className="font-display text-[17px] font-bold">{tenant.name}</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Pendiente</span>
          </div>
          <div className="relative my-4 border-t-2 border-dashed border-line">
            <span className="absolute -top-3 -left-8 size-6 rounded-full bg-surface" />
            <span className="absolute -top-3 -right-8 size-6 rounded-full bg-surface" />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-[13px]">
            <TicketItem label="Personas" value={String(form.guests)} />
            <TicketItem label="Día" value={form.date ? capitalize(fmtDay(form.date, { day: "numeric", month: "short" }).replace(".", "")) : ""} />
            <TicketItem label="Hora" value={form.time ?? ""} />
          </dl>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="pressable mt-6 mb-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink font-display font-bold text-white shadow-lift"
        >
          <Check className="size-5" /> Volver al menú
        </button>
      </motion.div>
    </div>
  );
}

function TicketItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="font-display text-[18px] font-bold">{value}</dd>
    </div>
  );
}

/* ───────────────────────── Shared ───────────────────────── */

function Chip({
  selected,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "pressable rounded-2xl font-semibold ring-1 disabled:opacity-35 disabled:active:scale-100",
        selected ? "bg-brand text-brand-fg shadow-brand ring-brand" : "bg-surface text-foreground ring-line hover:ring-foreground/20",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function SectionLabel({
  icon: Icon,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mb-3 flex items-center gap-2 text-[14px] font-semibold", className)}>
      <Icon className="size-4 text-brand" />
      {children}
    </p>
  );
}
