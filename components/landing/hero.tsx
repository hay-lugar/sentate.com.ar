import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-4 pt-16 pb-14 text-center sm:px-6 sm:pt-24 sm:pb-20">
      <h1 className="text-[2.5rem] leading-[1.05] font-semibold sm:text-6xl">Carta digital y reservas para tu local.</h1>
      <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
        Publicá la carta con un código QR y recibí solicitudes de mesa en un panel, donde las confirmás o las rechazás.
      </p>
      <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Link href="/registro" className={buttonClass({ size: "lg" })}>
          Crear cuenta
        </Link>
        <Link href="/el-bodegon" className={buttonClass({ variant: "secondary", size: "lg" })}>
          Ver la demo
        </Link>
      </div>
    </section>
  );
}
