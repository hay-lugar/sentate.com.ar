import Image from "next/image";
import Link from "next/link";
import { FavoriteButton } from "@/components/account/favorite-button";
import { buttonClass } from "@/components/ui/button";
import { getMyFavorites } from "@/lib/account/queries";
import { resolveImageRef, signImagePaths } from "@/lib/images/sign";
import { supabaseServer } from "@/lib/data/live/queries";

export const metadata = { title: "Favoritos" };

export default async function FavoritosPage() {
  const items = await getMyFavorites();
  const supabase = await supabaseServer();
  const signed = await signImagePaths(supabase, items.flatMap((i) => [i.cover_url, i.logo_url]));

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-line/70 p-6 text-center">
        <p className="text-[16px] font-medium">Todavía no guardaste favoritos.</p>
        <p className="mt-1 type-help">Tocá el corazón en un local del explorador para guardarlo acá. Tus favoritos son privados.</p>
        <Link href="/explorar" className={buttonClass({ className: "mt-4" })}>
          Explorar locales
        </Link>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((f) => {
        const img = resolveImageRef(signed, f.cover_url ?? f.logo_url);
        return (
          <li key={f.id} className="flex items-center gap-3 rounded-2xl border border-line/70 p-3">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-subtle">{img && <Image src={img} alt="" fill sizes="64px" className="object-cover" />}</div>
            <div className="min-w-0 flex-1">
              <Link href={`/${f.slug}`} className="block truncate text-[16px] font-semibold hover:underline">
                {f.name}
              </Link>
              <p className="truncate type-help">{[f.locality, f.price_range].filter(Boolean).join(" · ")}</p>
            </div>
            <FavoriteButton tenantId={f.id} name={f.name} initial loginHref={null} />
          </li>
        );
      })}
    </ul>
  );
}
