import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

/** Propuesta para negocios. Las reservas son opcionales: una cafetería puede usar solo la carta. */
export function ForBusiness() {
  return (
    <section id="negocios" aria-labelledby="negocios-titulo" className="mx-auto max-w-5xl scroll-mt-20 px-4 sm:px-6">
      <div className="rounded-[2rem] bg-subtle px-6 py-14 text-center sm:px-16 sm:py-20">
        <p className="type-label text-muted">Para negocios</p>
        <h2 id="negocios-titulo" className="mt-2 type-title">
          Tu carta, tu presencia online y tus reservas en un solo lugar.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted">
          Publicá una carta con código QR, aparecé en el mapa y, si lo necesitás, recibí solicitudes de mesa. Las reservas son opcionales: podés usar solo la carta.
        </p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link href="/registro" className={buttonClass({ size: "lg" })}>
            Crear cuenta
          </Link>
          <Link href="/el-bodegon" className={buttonClass({ variant: "secondary", size: "lg" })}>
            Ver la demo
          </Link>
        </div>
      </div>
    </section>
  );
}
