import Image from "next/image";
import { CalendarCheck, Plus, Star } from "lucide-react";
import { getTenant } from "@/data/mock";
import { formatPrice, initials, themeStyle } from "@/lib/utils";

/** Teléfono con una versión miniatura del menú real de El Bodegón (mismo mock, mismo theming). */
export function PhoneMockup() {
  const tenant = getTenant("el-bodegon")!;
  const dishes = tenant.categories.find((c) => c.id === "parrilla")!.dishes.slice(0, 3);

  return (
    <div style={themeStyle(tenant.theme)} className="relative w-[290px] shrink-0 sm:w-[310px]">
      <div className="rounded-[3.2rem] bg-ink p-[11px] shadow-[0_50px_100px_-30px_rgb(23_19_15/0.55),inset_0_0_0_1.5px_rgb(255_255_255/0.12)]">
        <div className="relative h-[600px] overflow-hidden rounded-[2.6rem] bg-background sm:h-[640px]">
          {/* Dynamic island */}
          <div className="absolute top-2.5 left-1/2 z-20 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-ink" />

          <div className="relative h-36">
            <Image src={tenant.coverImage} alt="" fill sizes="300px" className="object-cover" />
            <div className="absolute inset-0 bg-linear-to-b from-ink/40 to-transparent" />
          </div>
          <div className="relative -mt-6 rounded-t-[1.6rem] bg-background px-4">
            <div className="-mt-6 grid size-12 place-items-center rounded-2xl bg-brand font-display text-base font-bold text-brand-fg ring-[3px] ring-background">
              {initials(tenant.name)}
            </div>
            <p className="mt-2 font-display text-[19px] font-bold">{tenant.name}</p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Abierto
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-surface px-2 py-0.5 ring-1 ring-line">
                <Star className="size-2.5 fill-amber-400 text-amber-400" /> 4.7
              </span>
            </div>
            <div className="mt-3 flex gap-1 text-[11px] font-semibold">
              {["Entradas", "Parrilla", "Pastas", "Postres"].map((t) => (
                <span key={t} className={t === "Parrilla" ? "rounded-full bg-brand px-2.5 py-1 text-brand-fg" : "px-2 py-1 text-muted"}>
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {dishes.map((d) => (
                <div key={d.id} className="flex gap-2.5 rounded-2xl bg-surface p-2 shadow-soft ring-1 ring-line/60">
                  <div className="flex min-w-0 flex-1 flex-col py-0.5 pl-1">
                    <p className="truncate text-[12px] font-semibold">{d.name}</p>
                    <p className="line-clamp-1 text-[10px] text-muted">{d.description}</p>
                    <p className="mt-auto font-display text-[12px] font-bold">{formatPrice(d.price)}</p>
                  </div>
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl">
                    {d.image && <Image src={d.image} alt="" fill sizes="56px" className="object-cover" />}
                    <span className="absolute right-1 bottom-1 grid size-4 place-items-center rounded-full bg-surface text-brand">
                      <Plus className="size-2.5" strokeWidth={3} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-background via-background to-transparent p-3 pt-8">
            <div className="flex h-12 items-center gap-2 rounded-2xl bg-brand px-4 text-[13px] font-bold text-brand-fg shadow-brand">
              <CalendarCheck className="size-4" /> Reservar mesa
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
