"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Check, FlaskConical, RotateCcw } from "lucide-react";
import { describeSlot } from "@/lib/domain/schedule";
import type { SubmittedSummary } from "./use-reservation-request";

export function SubmittedView({ tenantName, summary, onClose }: { tenantName: string; summary: SubmittedSummary; onClose: () => void }) {
  return (
    <div className="px-6 pb-safe text-center" role="status">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="mx-auto grid size-20 place-items-center rounded-full bg-brand text-brand-fg shadow-brand"
      >
        <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.45 }} />
        </svg>
      </motion.div>

      <h2 className="mt-5 text-[26px] font-bold">Solicitud simulada</h2>
      <p className="mx-auto mt-1.5 max-w-[19rem] text-[14px] text-muted">
        Gracias, {summary.firstName}. Como esto es una demo, <b className="text-foreground">la solicitud no se envió a {tenantName}</b> y no se guardaron tus datos.
      </p>

      <div className="relative mt-6 rounded-3xl bg-background p-5 text-left ring-1 ring-line/70">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate font-display text-[17px] font-bold">{tenantName}</span>
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">Solicitud pendiente</span>
        </div>
        <div aria-hidden className="relative my-4 border-t-2 border-dashed border-line">
          <span className="absolute -top-3 -left-8 size-6 rounded-full bg-surface" />
          <span className="absolute -top-3 -right-8 size-6 rounded-full bg-surface" />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
          <dt className="text-muted">Personas</dt>
          <dd className="font-semibold">{summary.guests}</dd>
          <dt className="text-muted">Turno</dt>
          <dd className="font-semibold">{describeSlot(summary.slot)}</dd>
        </dl>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-accent p-3 text-left text-[12px] leading-snug text-accent-fg">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          En el producto real, una solicitud queda <b>pendiente</b> hasta que el local la acepta. Recién ahí es una <b>reserva confirmada</b>.
        </span>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="pressable mt-6 mb-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink font-display font-bold text-white shadow-lift"
      >
        <Check className="size-5" aria-hidden /> Volver al menú
      </button>
    </div>
  );
}

export function FailedView({ onRetry, onBack, retrying }: { onRetry: () => void; onBack: () => void; retrying: boolean }) {
  return (
    <div className="px-6 pb-safe text-center" role="alert">
      <div className="mx-auto grid size-20 place-items-center rounded-full bg-rose-50 text-rose-700">
        <AlertTriangle className="size-9" aria-hidden />
      </div>
      <h2 className="mt-5 text-[24px] font-bold">No pudimos enviar la solicitud</h2>
      <p className="mx-auto mt-1.5 max-w-[19rem] text-[14px] text-muted">
        Error simulado de la demo. Tus datos siguen cargados: podés reintentar.
      </p>
      <div className="mt-6 mb-2 flex gap-3">
        <button type="button" onClick={onBack} className="pressable h-14 flex-1 rounded-2xl bg-background font-semibold ring-1 ring-line">
          Revisar datos
        </button>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="pressable flex h-14 flex-[1.3] items-center justify-center gap-2 rounded-2xl bg-brand font-display font-bold text-brand-fg shadow-brand disabled:opacity-60"
        >
          <RotateCcw className="size-4" aria-hidden /> Reintentar
        </button>
      </div>
    </div>
  );
}
