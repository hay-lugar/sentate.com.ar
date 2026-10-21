"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/format";
import { useStorageUrl } from "@/lib/images/use-storage-url";

/** Logo del comercio con fallback a iniciales si no hay logo o la imagen falla. */
export function TenantLogo({ name, logoUrl, className }: { name: string; logoUrl?: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // Una ruta de Storage (panel) se firma en el navegador; una URL https (carta pública, demos) pasa igual.
  const url = useStorageUrl(logoUrl);
  const showImage = !!url && failedUrl !== url;

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden font-display font-bold",
        showImage ? "bg-surface" : "bg-brand text-brand-fg",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL o data URL arbitraria del comercio
        <img src={url} alt={`Logo de ${name}`} className="size-full object-cover" onError={() => setFailedUrl(url ?? null)} />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
