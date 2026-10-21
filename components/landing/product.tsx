import Image from "next/image";
import Link from "next/link";

/**
 * «Cómo se ve»: capturas reales de la demo (El Bodegón es un local de ejemplo). Se regeneran con
 * `node scripts/landing-shots.mjs` cuando cambia la interfaz. Son WebP ya dimensionados: se sirven sin optimizar.
 */
export function Product() {
  return (
    <section aria-labelledby="producto" className="border-t border-line bg-subtle">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 id="producto" className="text-3xl font-semibold sm:text-4xl">
          Así se ve
        </h2>
        <p className="mt-2 text-[15px] text-muted">Capturas de la demo, con datos de ejemplo.</p>

        <figure className="mt-12 grid items-center gap-8 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:gap-14">
          <Image
            src="/producto/carta.webp"
            alt="Carta pública de El Bodegón en un celular: categorías, platos con foto y precio, y el botón para reservar mesa"
            width={780}
            height={1688}
            sizes="(min-width: 768px) 300px, 90vw"
            unoptimized
            className="mx-auto h-auto w-full max-w-[300px] rounded-2xl border border-line bg-surface"
          />
          <figcaption className="max-w-md">
            <h3 className="text-2xl font-semibold">Carta</h3>
            <p className="mt-2 text-[16px] leading-relaxed text-muted">
              Categorías, platos con foto y precio, horarios y si el local está abierto. Se abre desde un QR, sin instalar nada.
            </p>
            <Link href="/el-bodegon" className="mt-3 inline-block text-[16px] font-medium underline underline-offset-4">
              Abrir la carta demo
            </Link>
          </figcaption>
        </figure>

        <figure className="mt-16 sm:mt-24">
          <figcaption className="max-w-xl">
            <h3 className="text-2xl font-semibold">Reservas</h3>
            <p className="mt-2 text-[16px] leading-relaxed text-muted">
              El comensal pide día, hora y cantidad de personas. La solicitud queda pendiente hasta que el local la confirma o la rechaza; Sentate no
              reserva la mesa por su cuenta.
            </p>
            <Link href="/admin/el-bodegon" className="mt-3 inline-block text-[16px] font-medium underline underline-offset-4">
              Abrir el panel demo
            </Link>
          </figcaption>
          <Image
            src="/producto/panel.webp"
            alt="Panel de reservas de El Bodegón: solicitudes pendientes con día, hora, personas y botones para confirmar o rechazar"
            width={1920}
            height={1140}
            sizes="(min-width: 1024px) 960px, 95vw"
            unoptimized
            className="mt-8 hidden h-auto w-full rounded-2xl border border-line bg-surface md:block"
          />
          <Image
            src="/producto/panel-mobile.webp"
            alt="Panel de reservas de El Bodegón en un celular: solicitudes pendientes con botones para confirmar o rechazar"
            width={780}
            height={1688}
            sizes="90vw"
            unoptimized
            className="mx-auto mt-8 h-auto w-full max-w-[300px] rounded-2xl border border-line bg-surface md:hidden"
          />
        </figure>
      </div>
    </section>
  );
}
