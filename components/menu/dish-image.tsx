"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/format";

const OPTIMIZABLE = /^https:\/\/images\.unsplash\.com\//;

/** Imagen de plato con fallback visible si no carga. URLs fuera de la lista de optimización se sirven sin optimizar. */
export function DishImage({
  src,
  alt,
  sizes,
  className,
  quality,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  quality?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) {
    return (
      <span role="img" aria-label={`${alt} (imagen no disponible)`} className={cn("grid size-full place-items-center bg-background text-muted", className)}>
        <ImageOff className="size-5" aria-hidden />
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      quality={quality}
      unoptimized={!OPTIMIZABLE.test(src)}
      onError={() => setFailed(src)}
      className={cn("object-cover", className)}
    />
  );
}
