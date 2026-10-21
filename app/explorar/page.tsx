import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Explorer } from "@/components/explorer/explorer";
import type { FacetData } from "@/components/explorer/types";
import { Logo } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/button";
import { BRAND } from "@/lib/config/brand";
import { redact } from "@/lib/log/redact";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/env";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Explorar locales",
  description: "Buscá locales gastronómicos por nombre, zona, tipo de cocina o plato, y pedí tu mesa.",
};
export const dynamic = "force-dynamic";

const EMPTY: FacetData = { total: 0, localities: [], business_types: [], cuisines: [], price: {} };

async function loadFacets(): Promise<{ facets: FacetData; failed: boolean }> {
  if (!isSupabaseConfigured()) return { facets: EMPTY, failed: false };
  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("explore_facets");
  if (error || !data) {
    console.error("[sentate] explorar facetas", error?.code, redact(error?.message));
    return { facets: EMPTY, failed: true };
  }
  return { facets: data as FacetData, failed: false };
}

export default async function ExplorarPage() {
  const { facets, failed } = await loadFacets();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-background">
        <nav aria-label="Principal" className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" aria-label={`${BRAND.name}, inicio`} className="mr-auto inline-flex min-h-11 items-center">
            <Logo size="md" />
          </Link>
          <Link href="/login" className={buttonClass({ variant: "quiet", size: "sm" })}>
            Ingresar
          </Link>
        </nav>
      </header>
      <main>
        <h1 className="sr-only">Explorar locales</h1>
        {failed ? (
          <p role="alert" className="mx-auto max-w-xl p-6 text-center text-[15px]">
            No pudimos cargar el explorador. Probá de nuevo en un rato.
          </p>
        ) : (
          <Suspense>
            <Explorer facets={facets} />
          </Suspense>
        )}
      </main>
    </>
  );
}
