"use client";

import Link from "next/link";
import { ExternalLink, Globe, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setPublishedAction } from "@/app/admin/[slug]/actions";
import { formatPlainDate, zonedNow } from "@/lib/time/zoned";
import { useDemo } from "./demo-provider";
import { PageHeader } from "./page-header";

export function DashboardHeader() {
  const { state, live, notify } = useDemo();
  const router = useRouter();
  const [pending, start] = useTransition();
  const now = zonedNow(state.profile.timezone);
  const hour = Math.floor(now.minutes / 60);
  const greeting = hour >= 6 && hour < 13 ? "Buen día" : hour >= 13 && hour < 20 ? "Buenas tardes" : "Buenas noches";
  const date = formatPlainDate(now.date, { weekday: "long", day: "numeric", month: "long" });
  const unpublished = live && !live.isPublished;

  const publish = () =>
    start(async () => {
      const res = await setPublishedAction(live!.tenantId, true);
      if (!res.ok) notify(res.message, "error");
      else notify("¡Tu menú ya es público!");
      router.refresh();
    });

  return (
    <>
      <PageHeader eyebrow={<span suppressHydrationWarning>{date}</span>} title={<span suppressHydrationWarning>{greeting}</span>}>
        {!unpublished && (
          <Link
            href={`/${state.slug}`}
            target="_blank"
            className="pressable inline-flex h-11 items-center gap-2 rounded-2xl bg-surface px-4 text-[14px] font-semibold shadow-soft ring-1 ring-line/70 hover:shadow-lift"
          >
            <ExternalLink className="size-4" aria-hidden /> Ver mi menú
            <span className="sr-only">(nueva pestaña)</span>
          </Link>
        )}
      </PageHeader>
      {unpublished && (
        <section className="mb-4 flex flex-col gap-3 rounded-[1.75rem] bg-surface p-5 shadow-soft ring-1 ring-line/70 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
            <Globe className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold">Tu menú todavía no es público</h2>
            <p className="text-[14px] text-muted">
              Cargá tu carta y tus horarios en Menú y Ajustes. Cuando publiques, tu menú queda en sentate.com.ar/{state.slug}.
            </p>
          </div>
          <button
            type="button"
            onClick={publish}
            disabled={pending}
            className="pressable inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-[14px] font-semibold text-brand-fg shadow-brand disabled:opacity-70"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Publicar menú
          </button>
        </section>
      )}
    </>
  );
}
