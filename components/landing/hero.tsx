"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Bell, Check, Eye, Play } from "lucide-react";
import type { ReactNode } from "react";
import type { TenantSummary } from "@/lib/domain/types";
import { trialLabel } from "@/lib/config/plan";

const ease = [0.2, 0.8, 0.2, 1] as const;

export function Hero({ phone, examples }: { phone: ReactNode; examples: TenantSummary[] }) {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 lg:pb-28">
      {/* Fondo: glow cálido + grano */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[38rem] w-[60rem] -translate-x-1/2 rounded-full bg-brand/15 blur-[120px]" />
        <div className="absolute top-60 -right-40 h-96 w-96 rounded-full bg-amber-300/25 blur-[100px]" />
        <div className="grain absolute inset-0" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="inline-flex items-center gap-2 rounded-full bg-surface py-1.5 pr-4 pl-1.5 text-[13px] font-semibold shadow-soft ring-1 ring-line/70"
          >
            <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] text-brand-fg">Demo</span>
            Probala con locales de ejemplo
          </motion.span>

          <h1 className="mt-6 text-[3.4rem] leading-[0.9] font-bold tracking-[-0.045em] sm:text-7xl lg:text-[5.6rem]">
            <motion.span
              className="block"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.05 }}
            >
              No hagas fila.
            </motion.span>
            <motion.span
              className="relative inline-block text-brand"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease, delay: 0.15 }}
            >
              Sentate.
              <svg aria-hidden viewBox="0 0 300 24" className="absolute -bottom-3 left-0 w-full overflow-visible" fill="none">
                <motion.path
                  d="M4 16 C 60 6, 140 4, 296 12"
                  stroke="currentColor"
                  strokeWidth={6}
                  strokeLinecap="round"
                  className="opacity-30"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, delay: 0.7, ease: "easeInOut" }}
                />
              </svg>
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease, delay: 0.3 }}
            className="mt-8 max-w-md text-lg leading-relaxed text-muted sm:text-xl"
          >
            El menú digital y gestor de reservas que tu local gastronómico necesita.{" "}
            <span className="font-semibold text-foreground">Listo en 10 minutos.</span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease, delay: 0.4 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              href="/registro"
              className="pressable group inline-flex h-15 items-center justify-center gap-2 rounded-2xl bg-ink px-7 text-[16px] font-semibold text-white shadow-lift hover:bg-ink/90"
            >
              Probar {trialLabel}
              <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link
              href="/el-bodegon"
              className="pressable inline-flex h-15 items-center justify-center gap-2.5 rounded-2xl bg-surface px-6 text-[16px] font-semibold shadow-soft ring-1 ring-line hover:shadow-lift"
            >
              <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-brand">
                <Play className="size-3 fill-current" />
              </span>
              Ver demo en vivo
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-muted">Locales de ejemplo:</span>
              {examples.map((t) => (
                <Link
                  key={t.slug}
                  href={`/${t.slug}`}
                  className="pressable inline-flex items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1 text-[13px] font-semibold shadow-soft ring-1 ring-line/70 hover:shadow-lift"
                >
                  <span aria-hidden style={{ background: t.theme.primary }} className="size-6 rounded-full" />
                  {t.name}
                </Link>
              ))}
            </div>
            <ul className="flex gap-4 text-[13px] font-medium text-muted">
              {["Sin tarjeta", "Sin comisión por reserva"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-emerald-700" strokeWidth={3} aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Teléfono + tarjetas flotantes */}
        <motion.div
          initial={{ opacity: 0, y: 60, rotate: 4 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 1, ease, delay: 0.2 }}
          className="relative mx-auto flex justify-center"
          aria-hidden
        >
          {phone}

          <FloatingCard className="top-24 -left-6 sm:-left-20" delay={0.9} float={-8}>
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand text-brand-fg">
              <Bell className="size-[18px]" />
            </span>
            <div className="text-[13px] leading-tight">
              <p className="font-semibold">Nueva solicitud</p>
              <p className="text-muted">Ejemplo · 4 pers · 21:30</p>
            </div>
          </FloatingCard>

          <FloatingCard className="-right-4 bottom-28 sm:-right-16" delay={1.1} float={8}>
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
              <Eye className="size-[18px]" />
            </span>
            <div className="text-[13px] leading-tight">
              <p className="font-semibold">Visitas al menú</p>
              <p className="text-muted">Métricas en tu panel</p>
            </div>
          </FloatingCard>
        </motion.div>
      </div>
    </section>
  );
}

function FloatingCard({
  children,
  className,
  delay,
  float,
}: {
  children: ReactNode;
  className: string;
  delay: number;
  float: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, y: [0, float, 0] }}
      transition={{
        opacity: { delay, duration: 0.5 },
        scale: { delay, type: "spring", stiffness: 260, damping: 18 },
        y: { delay: delay + 0.5, duration: 5, repeat: Infinity, ease: "easeInOut" },
      }}
      className={`absolute z-10 flex items-center gap-3 rounded-3xl bg-surface/90 p-3 pr-4 shadow-lift ring-1 ring-line/70 backdrop-blur-xl ${className}`}
    >
      {children}
    </motion.div>
  );
}
