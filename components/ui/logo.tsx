import Image from "next/image";
import { cn } from "@/lib/format";

/** Logo de Sentate (cubiertos + «SENTATE»). El archivo es negro sobre transparente: solo va sobre fondos claros. */
export function Logo({ className }: { className?: string }) {
  return <Image src="/sentate.svg" alt="Sentate" width={1004} height={633} unoptimized priority className={cn("h-11 w-auto", className)} />;
}
