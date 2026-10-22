"use client";

import Image from "next/image";
import { Check, Clock3, MapPin, Navigation, Phone, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PublicTenant } from "@/lib/domain/types";
import { describeWeek, type OpenState } from "@/lib/domain/schedule";
import { directionsUrl } from "@/lib/map/directions";
import { TenantLogo } from "@/components/ui/tenant-logo";
import { OpenStatusPill, StatusDot } from "./open-status";

const tileClass =
  "pressable flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl bg-subtle px-2 py-2.5 text-[0.8125rem] font-medium text-foreground hover:bg-line/60";

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
        <div className="absolute inset-x-0 top-0 flex items-start justify-start gap-2 p-4 pt-[max(env(safe-area-inset-top),1rem)]">
          {demo ? (
            <span className="rounded-md bg-black/70 px-2 py-1 text-[0.8125rem] font-medium text-white">
              {localEdits ? "Demo · con tus cambios" : "Demo · local de ejemplo"}
            </span>
          ) : (
            <span />
          )}
        </div>
      </div>

      <div className="px-5 pt-4 pb-4">
        <div className="flex items-start gap-4">
          <TenantLogo name={tenant.name} logoUrl={tenant.logoUrl} className="size-16 rounded-xl text-xl ring-1 ring-line" />
          <div className="min-w-0">
            <h1 className="text-[1.65rem] leading-tight font-semibold [overflow-wrap:anywhere]">{tenant.name}</h1>
            {tenant.tagline && <p className="mt-1 text-[0.9375rem] text-muted">{tenant.tagline}</p>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <OpenStatusPill state={status} />
          <p className="type-help">
            {tenant.cuisine} · <span className="text-foreground">{tenant.priceRange}</span>
          </p>
        </div>

        {/* Acciones rápidas, como en la ficha de un lugar de Apple Maps: lo que más se hace desde el celular, a un toque. */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <a href={`tel:${tenant.phone.replace(/[^\d+]/g, "")}`} aria-label={`Llamar a ${tenant.name}`} className={tileClass}>
            <Phone className="size-5" aria-hidden />
            <span>Llamar</span>
          </a>
          <a href={directionsUrl(tenant)} target="_blank" rel="noreferrer" className={tileClass}>
            <Navigation className="size-5" aria-hidden />
            <span>Cómo llegar</span>
            <span className="sr-only">(abre Google Maps)</span>
          </a>
          <button type="button" onClick={share} aria-label={copied ? "Enlace copiado" : "Compartir"} className={tileClass}>
            {copied ? <Check className="size-5" aria-hidden /> : <Share2 className="size-5" aria-hidden />}
            <span>{copied ? "Copiado" : "Compartir"}</span>
          </button>
        </div>

        <ul className="mt-3 divide-y divide-line/70 overflow-hidden rounded-2xl bg-subtle text-[0.9375rem]">
          <li className="flex items-start gap-3 px-4 py-3">
            <MapPin className="mt-0.5 size-[1.125rem] shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{tenant.address}</span>
          </li>
          <li>
            <a href={`tel:${tenant.phone.replace(/[^\d+]/g, "")}`} className="pressable flex min-h-12 items-center gap-3 px-4 py-2">
              <Phone className="size-[1.125rem] shrink-0 text-muted" aria-hidden />
              <span className="tabular-nums">{tenant.phone}</span>
            </a>
          </li>
          {weekLines.length > 0 && (
            <li className="flex items-start gap-3 px-4 py-3">
              <Clock3 className="mt-0.5 size-[1.125rem] shrink-0 text-muted" aria-hidden />
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

/** Barra compacta que aparece al scrollear: nombre y estado. Solo CSS (sin framer-motion): la carta carga menos JavaScript. */
export function CompactBar({ tenant, status, visible }: { tenant: PublicTenant; status: OpenState; visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 top-0 z-40 bar-blur mx-auto max-w-xl border-b border-line/70 pt-[env(safe-area-inset-top)] transition-opacity duration-150 motion-reduce:transition-none ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <div className="flex h-14 items-center gap-3 px-5">
        <TenantLogo name={tenant.name} logoUrl={tenant.logoUrl} className="size-8 rounded-lg text-[0.8125rem]" />
        <span className="truncate text-[1rem] font-semibold">{tenant.name}</span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 type-help">
          <StatusDot open={status.open} />
          {status.open ? "Abierto" : "Cerrado"}
        </span>
      </div>
    </div>
  );
}
