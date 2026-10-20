"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Minus, Phone, Plus, Users } from "lucide-react";
import { RESERVATION_LIMITS } from "@/lib/reservation/validation";
import { Chip, FieldError } from "./controls";

const { minGuests, maxGuests } = RESERVATION_LIMITS;

export function GuestsStep({ guests, onChange, phone, error }: { guests: number; onChange: (n: number) => void; phone: string; error?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between rounded-3xl bg-background p-3 ring-1 ring-line/70">
        <StepperButton label="Una persona menos" disabled={guests <= minGuests} onClick={() => onChange(guests - 1)}>
          <Minus className="size-5" strokeWidth={2.75} />
        </StepperButton>
        <div className="text-center" aria-live="polite">
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
        <StepperButton label="Una persona más" disabled={guests >= maxGuests} onClick={() => onChange(guests + 1)}>
          <Plus className="size-5" strokeWidth={2.75} />
        </StepperButton>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2" role="group" aria-label="Cantidad de personas">
        {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
          <Chip key={n} selected={guests === n} onClick={() => onChange(n)} className="h-12 text-[15px]" aria-label={`${n} ${n === 1 ? "persona" : "personas"}`}>
            {n}
          </Chip>
        ))}
      </div>
      <FieldError id="err-guests">{error}</FieldError>

      <a
        href={`tel:${phone.replace(/[^\d+]/g, "")}`}
        className="pressable mt-5 flex items-center gap-3 rounded-2xl bg-accent p-4 text-accent-fg"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/60">
          <Users className="size-[18px]" aria-hidden />
        </span>
        <span className="text-[13px] leading-snug">
          <b className="font-semibold">¿Son más de {maxGuests}?</b> Llamá al local para grupos grandes.
        </span>
        <Phone className="ml-auto size-4 shrink-0" aria-hidden />
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
