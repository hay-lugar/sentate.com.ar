import Image from "next/image";
import Link from "next/link";
import { Tag } from "lucide-react";
import { cn } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";
import { FavoriteButton } from "@/components/account/favorite-button";
import { formatDistance, type FacetData, type ResultItem } from "./types";

type Props = {
  item: ResultItem;
  facets: FacetData;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** Sin botón de selección ni anclas (tarjeta del mapa). */
  compact?: boolean;
  /** Corazón de favoritos: `loginHref` si no hay sesión. Sin esta prop no se muestra. */
  favorite?: { initial: boolean; loginHref: string | null };
};

export function ResultCard({ item, facets, selected, onSelect, compact, favorite }: Props) {
  const type = facets.business_types.find((b) => b.code === item.business_type)?.label;
  const cuisines = item.cuisines.map((c) => facets.cuisines.find((x) => x.code === c)?.label).filter(Boolean);
  const distance = formatDistance(item.distance_m);
  const meta = [type, item.price_range, ...cuisines.slice(0, 2)].filter(Boolean).join(" · ");
  const place = [item.neighborhood && item.neighborhood !== item.locality ? item.neighborhood : null, item.locality].filter(Boolean).join(", ");

  return (
    <article
      id={`res-${item.id}`}
      aria-label={item.name}
      data-selected={selected ? "true" : undefined}
      className={cn("flex rounded-2xl border bg-background", compact ? "gap-3 p-3" : "flex-col gap-3 p-2.5 pb-3.5", selected ? "border-foreground ring-1 ring-foreground" : "border-line/70")}
    >
      <div className={cn("relative shrink-0 overflow-hidden bg-subtle", compact ? "size-20 rounded-lg sm:size-24" : "aspect-[16/9] w-full rounded-xl")}>
        {item.cover_url || item.logo_url ? (
          <Image src={(item.cover_url ?? item.logo_url) as string} alt="" fill sizes={compact ? "96px" : "(min-width: 1024px) 420px, 100vw"} className="object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className={cn("min-w-0 flex-1", !compact && "px-1.5")}>
        <div className="flex items-start gap-1">
          <h3 className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">{item.name}</h3>
          {favorite && <FavoriteButton tenantId={item.id} name={item.name} initial={favorite.initial} loginHref={favorite.loginHref} />}
        </div>
        <p className="truncate type-help">{meta}</p>
        <p className="truncate type-help">
          {place}
          {distance ? ` · ${distance}` : ""}
        </p>
        {item.promotion && (
          <p className="mt-1 flex items-start gap-1.5 rounded-md bg-subtle px-2 py-1.5 text-[0.8125rem] leading-snug" title={item.promotion.detail || undefined}>
            <Tag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="sr-only">Promoción: </span>
              <span className="font-medium">{item.promotion.title}</span>
              {item.promotion.detail && <span className="text-muted"> · {item.promotion.detail}</span>}
            </span>
          </p>
        )}
        {item.featured && <p className="mt-1 inline-block rounded-md border border-line-strong px-1.5 py-1 text-[0.8125rem] leading-none font-medium">Destacado</p>}
        <p className={cn("mt-1 text-[0.8125rem] font-medium", item.open_now ? "text-success" : "text-muted")}>{item.open_now ? "Abierto ahora" : "Cerrado ahora"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/${item.slug}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
            Ver carta
          </Link>
          {item.accepts_reservations !== false && (
            <Link href={`/${item.slug}?mesa=1`} className={buttonClass({ size: "sm" })}>
              Pedir mesa
            </Link>
          )}
          {!compact && onSelect && (
            <button type="button" onClick={() => onSelect(item.id)} aria-pressed={selected} className={buttonClass({ variant: "quiet", size: "sm", className: "lg:hidden" })}>
              Ver en el mapa
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
