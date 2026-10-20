"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, MapPin, Phone, Share2, Star } from "lucide-react";
import { useState } from "react";
import type { PublicTenant } from "./menu-view";
import { cn, formatNumber, initials, type OpenState } from "@/lib/utils";
import { OpenStatusPill, StatusDot } from "./open-status";

export function TenantAvatar({ tenant, className }: { tenant: Pick<PublicTenant, "name">; className?: string }) {
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center bg-brand font-display font-bold text-brand-fg",
        "bg-[radial-gradient(120%_120%_at_20%_10%,rgb(255_255_255/0.28),transparent_55%)]",
        className,
      )}
    >
      {initials(tenant.name)}
    </div>
  );
}

export function RestaurantHeader({ tenant, status }: { tenant: PublicTenant; status: OpenState }) {
  const [liked, setLiked] = useState(false);

  const share = async () => {
    const data = { title: tenant.name, text: tenant.tagline, url: window.location.href };
    if (navigator.share) await navigator.share(data).catch(() => {});
    else await navigator.clipboard?.writeText(data.url);
  };

  return (
    <header>
      <div className="relative h-60 overflow-hidden">
        <Image src={tenant.coverImage} alt="" fill priority sizes="(max-width: 448px) 100vw, 448px" className="object-cover" />
        <div className="absolute inset-0 bg-linear-to-b from-ink/45 via-ink/5 to-ink/30" />
        <div className="absolute inset-x-0 top-0 flex justify-end gap-2 p-4 pt-[max(env(safe-area-inset-top),1rem)]">
          <GlassButton label="Compartir" onClick={share}>
            <Share2 className="size-[18px]" />
          </GlassButton>
          <GlassButton label="Guardar" onClick={() => setLiked((v) => !v)}>
            <motion.span key={String(liked)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
              <Heart className={cn("size-[18px]", liked && "fill-rose-500 text-rose-500")} />
            </motion.span>
          </GlassButton>
        </div>
      </div>

      <div className="relative -mt-8 rounded-t-[2rem] bg-background px-5 pt-0 pb-2">
        <TenantAvatar tenant={tenant} className="-mt-9 size-[4.5rem] rounded-[1.4rem] text-2xl shadow-lift ring-4 ring-background" />

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
          <h1 className="mt-3 text-[1.85rem] leading-none font-bold">{tenant.name}</h1>
          <p className="mt-1.5 text-[15px] text-muted">{tenant.tagline}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <OpenStatusPill state={status} />
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold shadow-soft ring-1 ring-line/70">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {tenant.rating.toFixed(1)}
              <span className="font-medium text-muted">({formatNumber(tenant.reviews)})</span>
            </span>
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
                <MapPin className="size-4" />
              </span>
              <span className="truncate font-medium">{tenant.address}</span>
            </a>
            <a
              href={`tel:${tenant.phone.replace(/\s|-/g, "")}`}
              aria-label="Llamar"
              className="pressable grid aspect-square place-items-center rounded-2xl bg-surface shadow-soft ring-1 ring-line/70"
            >
              <span className="grid size-8 place-items-center rounded-xl bg-brand-soft text-brand">
                <Phone className="size-4" />
              </span>
            </a>
          </div>
        </motion.div>
      </div>
    </header>
  );
}

function GlassButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="pressable grid size-10 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-md hover:bg-white/30"
    >
      {children}
    </button>
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
          className="fixed inset-x-0 top-0 z-40 mx-auto max-w-md bg-background/95 backdrop-blur-xl"
        >
          <div className="flex h-14 items-center gap-3 px-5">
            <TenantAvatar tenant={tenant} className="size-8 rounded-[0.65rem] text-[13px]" />
            <span className="truncate font-display text-[17px] font-bold">{tenant.name}</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted">
              <StatusDot open={status.open} />
              {status.open ? "Abierto" : "Cerrado"}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
