import Image from "next/image";
import { BRAND } from "@/lib/config/brand";
import { cn } from "@/lib/format";

/**
 * Marca de la plataforma: el símbolo de los cubiertos (vector propio, sin texto) y el nombre como wordmark tipográfico.
 * El nombre sale de `lib/config/brand.ts`. El símbolo es decorativo: la marca se lee (y se anuncia) por el texto.
 *
 * - `sm` panel y pie, `md` barra de navegación, `lg` ingreso y alta (apilado y centrado).
 * - Una sola vez por pantalla: no se repite como decoración.
 */
const SIZE = {
  sm: { box: "gap-2", symbol: "h-5", text: "text-[17px]" },
  md: { box: "gap-2", symbol: "hidden h-5 min-[360px]:block sm:h-6", text: "text-[17px] sm:text-[20px]" },
  lg: { box: "flex-col gap-3", symbol: "h-12", text: "text-2xl" },
} as const;

export function Logo({ size = "md", className }: { size?: keyof typeof SIZE; className?: string }) {
  const s = SIZE[size];
  return (
    <span className={cn("inline-flex items-center", s.box, className)}>
      <Image src="/marca/cubiertos.svg" alt="" aria-hidden width={1059} height={1371} unoptimized priority className={cn(s.symbol, "w-auto")} />
      <span className={cn("font-medium tracking-tight whitespace-nowrap", s.text)}>{BRAND.name}</span>
    </span>
  );
}
