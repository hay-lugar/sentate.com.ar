import Image from "next/image";
import { CalendarCheck, Plus } from "lucide-react";
import type { PublicTenant } from "@/lib/domain/types";
import { formatPrice } from "@/lib/format";
import { themeStyle } from "@/lib/theme";
import { TenantLogo } from "@/components/ui/tenant-logo";

/** Teléfono con una miniatura del menú de un local de ejemplo (decorativo). */
export function PhoneMockup({ tenant }: { tenant: PublicTenant }) {
  const category = tenant.categories[1] ?? tenant.categories[0];
  const dishes = category?.dishes.slice(0, 3) ?? [];

  return (
    <div style={themeStyle(tenant.theme)} className="relative w-[290px] shrink-0 sm:w-[310px]" aria-hidden>
      <div className="rounded-[3.2rem] bg-ink p-[11px] shadow-[0_50px_100px_-30px_rgb(23_19_15/0.55),inset_0_0_0_1.5px_rgb(255_255_255/0.12)]">
        <div className="relative h-[600px] overflow-hidden rounded-[2.6rem] bg-background sm:h-[640px]">
          <div className="absolute top-2.5 left-1/2 z-20 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-ink" />

          <div className="relative h-36 bg-brand/30">
            {tenant.coverImage && <Image src={tenant.coverImage} alt="" fill sizes="300px" className="object-cover" />}
            <div className="absolute inset-0 bg-linear-to-b from-ink/40 to-transparent" />
            <span className="absolute right-3 bottom-8 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-900 uppercase">Ejemplo</span>
          </div>
          <div className="relative -mt-6 rounded-t-[1.6rem] bg-background px-4">
            <TenantLogo name={tenant.name} logoUrl={tenant.logoUrl} className="-mt-6 size-12 rounded-2xl text-base ring-[3px] ring-background" />
            <p className="mt-2 font-display text-[19px] font-bold">{tenant.name}</p>
            <p className="text-[11px] text-muted">{tenant.cuisine}</p>
            <div className="mt-3 flex gap-1 text-[11px] font-semibold">
              {tenant.categories.slice(0, 4).map((c) => (
                <span key={c.id} className={c.id === category?.id ? "rounded-full bg-brand px-2.5 py-1 text-brand-fg" : "px-2 py-1 text-muted"}>
                  {c.name}
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
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-background">
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
