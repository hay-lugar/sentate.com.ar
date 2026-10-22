import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/config/brand";

/**
 * «Cómo se ve»: capturas reales de la demo (El Bodegón es un local de ejemplo), en mosaicos como en una página de producto de
 * Apple: titular arriba, imagen debajo recortada por el borde. Se regeneran con `node scripts/landing-shots.mjs` cuando cambia la
 * interfaz. Son WebP ya dimensionados: se sirven sin optimizar.
 */
export function Product() {
  return (
    <section aria-labelledby="producto" className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
      <h2 id="producto" className="type-title text-center">
        Así se ve
      </h2>
      <p className="mt-2 text-center text-[1rem] text-muted">Capturas de la demo, con datos de ejemplo.</p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <figure className="flex flex-col overflow-hidden rounded-[2rem] bg-subtle pt-10 text-center">
          <figcaption className="px-6">
            <h3 className="type-heading">Carta</h3>
            <p className="mx-auto mt-2 max-w-xs text-[1rem] leading-relaxed text-muted">Categorías, platos con foto y precio, y horarios. Se abre desde un QR, sin instalar nada.</p>
            <Link href="/el-bodegon" className="mt-2 inline-flex min-h-11 items-center text-[1rem] font-medium underline underline-offset-4">
              Abrir la carta demo
            </Link>
          </figcaption>
          <Image
            src="/producto/carta.webp"
            alt="Carta pública de El Bodegón en un celular: categorías, platos con foto y precio, y el botón para reservar mesa"
            width={780}
            height={1688}
            sizes="(min-width: 768px) 280px, 70vw"
            unoptimized
            className="mx-auto mt-8 h-[26rem] w-[13.5rem] max-w-[70%] rounded-t-[1.75rem] border border-b-0 border-line-strong bg-surface object-cover object-top sm:h-[30rem] sm:w-[15.5rem]"
          />
        </figure>

        <figure className="flex flex-col overflow-hidden rounded-[2rem] bg-subtle pt-10 text-center">
          <figcaption className="px-6">
            <h3 className="type-heading">Reservas</h3>
            <p className="mx-auto mt-2 max-w-xs text-[1rem] leading-relaxed text-muted">
              La solicitud queda pendiente hasta que el local la confirma o la rechaza. {BRAND.name} no reserva mesas por su cuenta ni avisa al comensal.
            </p>
            <Link href="/admin/el-bodegon" className="mt-2 inline-flex min-h-11 items-center text-[1rem] font-medium underline underline-offset-4">
              Abrir el panel demo
            </Link>
          </figcaption>
          <Image
            src="/producto/panel-mobile.webp"
            alt="Panel de reservas de El Bodegón en un celular: solicitudes pendientes con botones para confirmar o rechazar"
            width={780}
            height={1688}
            sizes="(min-width: 768px) 280px, 70vw"
            unoptimized
            className="mx-auto mt-8 h-[26rem] w-[13.5rem] max-w-[70%] rounded-t-[1.75rem] border border-b-0 border-line-strong bg-surface object-cover object-top sm:h-[30rem] sm:w-[15.5rem]"
          />
        </figure>
      </div>
    </section>
  );
}
