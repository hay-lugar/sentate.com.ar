"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock3, MapPin, Phone, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PublicTenant } from "@/lib/domain/types";
import { describeWeek, type OpenState } from "@/lib/domain/schedule";
import { TenantLogo } from "@/components/ui/tenant-logo";
import { OpenStatusPill, StatusDot } from "./open-status";

export function RestaurantHeader({
  tenant,
  status,
  demo,
  localEdits,
}: {
  tenant: PublicTenant;
  status: OpenState;
  demo: boolean;
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

  const weekLines = describeWeek(tenant.schedule);

  return (
    <header>
      <div className="relative h-36 overflow-hidden bg-subtle sm:h-56">
        {tenant.coverImage && <Image src={tenant.coverImage} alt="" fill priority sizes="(max-width: 576px) 100vw, 576px" className="object-cover" />}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4 pt-[max(env(safe-area-inset-top),1rem)]">
          {demo ? (
            <span className="rounded-md bg-black/70 px-2 py-1 text-[13px] font-medium text-white">
              {localEdits ? "Demo · con tus cambios" : "Demo · local de ejemplo"}
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            aria-label={copied ? "Enlace copiado" : "Compartir"}
            onClick={share}
            className="pressable grid size-11 place-items-center rounded-full bg-black/60 text-white hover:bg-black/70"
          >
            {copied ? <Check className="size-[18px]" /> : <Share2 className="size-[18px]" />}
          </button>
        </div>
      </div>

      <div className="px-5 pt-4 pb-4">
        <div className="flex items-start gap-4">
          <TenantLogo name={tenant.name} logoUrl={tenant.logoUrl} className="size-16 rounded-xl text-xl ring-1 ring-line" />
          <div className="min-w-0">
            <h1 className="text-[1.65rem] leading-tight font-semibold [overflow-wrap:anywhere]">{tenant.name}</h1>
            {tenant.tagline && <p className="mt-1 text-[15px] text-muted">{tenant.tagline}</p>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <OpenStatusPill state={status} />
          <p className="type-help">
            {tenant.cuisine} · <span className="text-foreground">{tenant.priceRange}</span>
          </p>
        </div>

        <ul className="mt-3 divide-y divide-line border-y border-line text-[15px]">
          <li>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(tenant.address)}`}
              target="_blank"
              rel="noreferrer"
              className="pressable flex min-h-12 items-center gap-3 py-2"
            >
              <MapPin className="size-[18px] shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{tenant.address}</span>
              <span className="sr-only">(abre Google Maps)</span>
            </a>
          </li>
          <li>
            <a href={`tel:${tenant.phone.replace(/[^\d+]/g, "")}`} aria-label={`Llamar a ${tenant.name}`} className="pressable flex min-h-12 items-center gap-3 py-2">
              <Phone className="size-[18px] shrink-0 text-muted" aria-hidden />
              <span className="tabular-nums">{tenant.phone}</span>
            </a>
          </li>
          {weekLines.length > 0 && (
            <li className="flex items-start gap-3 py-2.5">
              <Clock3 className="mt-0.5 size-[18px] shrink-0 text-muted" aria-hidden />
              <div className="type-help">
                <span className="sr-only">Horarios: </span>
                <ul aria-label="Horarios" className="space-y-0.5">
                  {weekLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </li>
          )}
        </ul>
      </div>
    </header>
  );
}

/** Barra compacta que aparece al scrollear: nombre y estado. */
export function CompactBar({ tenant, status, visible }: { tenant: PublicTenant; status: OpenState; visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-x-0 top-0 z-40 mx-auto max-w-xl border-b border-line bg-background pt-[env(safe-area-inset-top)]"
        >
          <div className="flex h-14 items-center gap-3 px-5">
            <TenantLogo name={tenant.name} logoUrl={tenant.logoUrl} className="size-8 rounded-lg text-[13px]" />
            <span className="truncate text-[16px] font-semibold">{tenant.name}</span>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 type-help">
              <StatusDot open={status.open} />
              {status.open ? "Abierto" : "Cerrado"}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
