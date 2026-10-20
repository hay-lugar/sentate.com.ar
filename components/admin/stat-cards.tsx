"use client";

import { motion } from "framer-motion";
import { CalendarCheck, Eye, TrendingDown, TrendingUp, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn, formatNumber } from "@/lib/format";
import { useDemo } from "./demo-provider";

export function StatCards() {
  const { state, stats, mode } = useDemo();
  const demo = mode === "demo";
  const dishes = state.categories.flatMap((c) => c.dishes);
  const activeDishes = dishes.filter((d) => d.active).length;
  const totalDishes = dishes.length;
  const views = stats?.menuViewsLast7 ?? [];
  const prevViews = stats?.menuViewsPrev7Total ?? 0;
  const pct = totalDishes ? Math.round((activeDishes / totalDishes) * 100) : 0;
  // Fecha de servicio de hoy (incluye turnos después de medianoche).
  const today = state.reservations.filter((r) => r.dayOffset === 0 && r.status !== "rejected");
  const covers = today.reduce((n, r) => n + r.guests, 0);
  const pendingToday = today.filter((r) => r.status === "pending").length;

  const totalViews = views.reduce((a, b) => a + b, 0);
  const trend = prevViews ? Math.round(((totalViews - prevViews) / prevViews) * 100) : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard
        index={0}
        icon={CalendarCheck}
        label={demo ? "Mesas de hoy · ejemplo" : "Mesas de hoy"}
        value={today.length}
        highlight
        footer={
          <>
            <b className="font-semibold">{covers}</b> cubiertos ·{" "}
            <b className="font-semibold">{pendingToday}</b> {pendingToday === 1 ? "solicitud pendiente" : "solicitudes pendientes"}
          </>
        }
      />
      <StatCard
        index={1}
        icon={UtensilsCrossed}
        label="Platos activos"
        value={activeDishes}
        suffix={`/ ${totalDishes}`}
        footer={
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, delay: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </div>
            <span className="tabular-nums">{pct}%</span>
          </div>
        }
      />
      {stats ? (
      <StatCard
        index={2}
        icon={Eye}
        label="Visitas al menú · 7 días · ejemplo"
        value={formatNumber(totalViews)}
        className="sm:col-span-2 xl:col-span-1"
        aside={<Sparkline data={views} />}
        footer={
          <span className={cn("inline-flex items-center gap-1 font-semibold", trend >= 0 ? "text-emerald-600" : "text-rose-600")}>
            {trend >= 0 ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
            {trend >= 0 ? "+" : ""}
            {trend}% <span className="font-normal text-muted">vs. semana anterior (dato ficticio)</span>
          </span>
        }
      />
      ) : (
        <StatCard
          index={2}
          icon={Eye}
          label="Visitas al menú"
          value="—"
          className="sm:col-span-2 xl:col-span-1"
          footer={<span>Las métricas de visitas llegan en una próxima versión.</span>}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  footer,
  aside,
  highlight,
  className,
  index,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  suffix?: string;
  footer: ReactNode;
  aside?: ReactNode;
  highlight?: boolean;
  className?: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.2, 0.8, 0.2, 1] }}
      whileHover={{ y: -3 }}
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] p-5 shadow-soft ring-1 transition-shadow hover:shadow-lift",
        highlight ? "bg-brand text-brand-fg shadow-brand ring-transparent" : "bg-surface ring-line/70",
        className,
      )}
    >
      {highlight && (
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-white/15 blur-2xl" />
      )}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <span
            className={cn(
              "grid size-11 place-items-center rounded-2xl",
              highlight ? "bg-white/20" : "bg-brand-soft text-brand",
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <p className={cn("mt-4 text-[13px] font-medium", highlight ? "opacity-90" : "text-muted")}>{label}</p>
          <p className="mt-0.5 font-display text-[2.6rem] leading-none font-bold tracking-tight tabular-nums">
            {value}
            {suffix && <span className={cn("ml-1 text-xl font-semibold", highlight ? "opacity-60" : "text-muted")}>{suffix}</span>}
          </p>
        </div>
        {aside}
      </div>
      <div className={cn("relative mt-4 text-[13px]", highlight ? "opacity-90" : "text-muted")}>{footer}</div>
    </motion.div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 120;
  const h = 56;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 6 - ((v - min) / (max - min || 1)) * (h - 12)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-14 w-28 overflow-visible text-brand" aria-hidden>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${line} L${w},${h} L0,${h} Z`}
        fill="url(#spark-fill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, delay: 0.2, ease: "easeInOut" }}
      />
      <circle cx={lx} cy={ly} r={4} fill="currentColor" stroke="white" strokeWidth={2} />
    </svg>
  );
}
