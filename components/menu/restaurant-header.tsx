"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock3, MapPin, Phone, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PublicTenant } from "@/lib/domain/types";
import type { OpenState } from "@/lib/domain/schedule";
import { DemoBadge } from "@/components/ui/demo-badge";
import { TenantLogo } from "@/components/ui/tenant-logo";
import { OpenStatusPill, StatusDot } from "./open-status";

export function RestaurantHeader({
  tenant,
  status,
  localEdits,
}: {
  tenant: PublicTenant;
  status: OpenState;
  localEdits: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const share = async () => {
    const data = { title: tenant.name, text: tenant.tagline, url: window.location.href };
    if (navigator.share) {
      await navigator.share(data).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const shiftsLabel = tenant.schedule.shifts.map((s) => `${s.open}–${s.close}`).join(" · ");

  return (
    <header>
      <div className="relative h-56 overflow-hidden bg-brand/30 sm:h-60">
        {tenant.coverImage && (
          <Image src={tenant.coverImage} alt="" fill priority sizes="(max-width: 448px) 100vw, 448px" className="object-cover" />
        )}
        <div className="absolute inset-0 bg-linear-to-b from-ink/50 via-ink/5 to-ink/30" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4 pt-[max(env(safe-area-inset-top),1rem)]">
          <DemoBadge label={localEdits ? "Demo · con tus cambios" : "Demo · local de ejemplo"} />
          <button
            type="button"
            aria-label={copied ? "Enlace copiado" : "Compartir"}
            onClick={share}
            className="pressable grid size-11 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-md hover:bg-white/30"
          >
            {copied ? <Check className="size-[18px]" /> : <Share2 className="size-[18px]" />}
          </button>
        </div>
      </div>

      <div className="relative -mt-8 rounded-t-[2rem] bg-background px-5 pb-2">
        <TenantLogo
          name={tenant.name}
          logoUrl={tenant.logoUrl}
          className="-mt-9 size-[4.5rem] rounded-[1.4rem] text-2xl shadow-lift ring-4 ring-background"
        />

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
          <h1 className="mt-3 text-[1.85rem] leading-tight font-bold [overflow-wrap:anywhere]">{tenant.name}</h1>
          {tenant.tagline && <p className="mt-1.5 text-[15px] text-muted">{tenant.tagline}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <OpenStatusPill state={status} />
            <span className="rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold text-muted shadow-soft ring-1 ring-line/70">
              {tenant.cuisine} · <span className="text-foreground">{tenant.priceRange}</span>
            </span>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2 text-[13px]">
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(tenant.address)}`}
              target="_blank"
              rel="noreferrer"
              className="pressable flex min-w-0 items-center gap-2.5 rounded-2xl bg-surface p-2.5 shadow-soft ring-1 ring-line/70"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <MapPin className="size-4" aria-hidden />
              </span>
              <span className="truncate font-medium">{tenant.address}</span>
              <span className="sr-only">(abre Google Maps)</span>
            </a>
            <a
              href={`tel:${tenant.phone.replace(/[^\d+]/g, "")}`}
              aria-label={`Llamar a ${tenant.name}`}
              className="pressable grid aspect-square place-items-center rounded-2xl bg-surface shadow-soft ring-1 ring-line/70"
            >
              <span className="grid size-8 place-items-center rounded-xl bg-brand-soft text-brand">
                <Phone className="size-4" aria-hidden />
              </span>
            </a>
          </div>
          {shiftsLabel && (
            <p className="mt-3 flex items-center gap-1.5 px-1 text-[12px] text-muted">
              <Clock3 className="size-3.5" aria-hidden />
              Horarios: {shiftsLabel}
            </p>
          )}
        </motion.div>
      </div>
    </header>
  );
}

/** Barra compacta que aparece al scrollear: nombre + estado, como un nav bar nativo. */
export function CompactBar({ tenant, status, visible }: { tenant: PublicTenant; status: OpenState; visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: "-100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 400 }}
          className="fixed inset-x-0 top-0 z-40 mx-auto max-w-md bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl"
        >
          <div className="flex h-14 items-center gap-3 px-5">
            <TenantLogo name={tenant.name} logoUrl={tenant.logoUrl} className="size-8 rounded-[0.65rem] text-[13px]" />
            <span className="truncate font-display text-[17px] font-bold">{tenant.name}</span>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-muted">
              <StatusDot open={status.open} />
              {status.open ? "Abierto" : "Cerrado"}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
