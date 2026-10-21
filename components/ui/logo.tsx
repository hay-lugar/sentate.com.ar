import Image from "next/image";
import { cn } from "@/lib/format";

/**
 * Logo de Sentate (cubiertos + «SENTATE»), el SVG original recortado a su contenido, sin deformar.
 * El archivo es negro sobre transparente: va sobre fondos claros. Las proporciones son 1004 × 633.
 * Tamaños: `sm` panel y pie, `md` barra de navegación, `lg` ingreso y alta.
 */
const SIZE = { sm: "h-10", md: "h-12", lg: "h-20" } as const;

export function Logo({ size = "md", className }: { size?: keyof typeof SIZE; className?: string }) {
  return <Image src="/sentate.svg" alt="Sentate" width={1004} height={633} unoptimized priority className={cn(SIZE[size], "w-auto", className)} />;
}
