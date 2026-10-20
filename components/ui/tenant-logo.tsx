"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/format";

/** Logo del comercio con fallback a iniciales si no hay logo o la imagen falla. */
export function TenantLogo({ name, logoUrl, className }: { name: string; logoUrl?: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!logoUrl && failedUrl !== logoUrl;

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden font-display font-bold",
        showImage ? "bg-surface" : "bg-brand text-brand-fg bg-[radial-gradient(120%_120%_at_20%_10%,rgb(255_255_255/0.28),transparent_55%)]",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL o data URL arbitraria del comercio
        <img src={logoUrl} alt={`Logo de ${name}`} className="size-full object-cover" onError={() => setFailedUrl(logoUrl)} />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
