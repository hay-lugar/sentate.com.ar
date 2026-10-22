"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { setPublishedAction } from "@/app/admin/[slug]/actions";
import { formatPlainDate, zonedNow } from "@/lib/time/zoned";
import { useDemo } from "./demo-provider";
import { PageHeader } from "./page-header";

export function DashboardHeader() {
  const { state, live, notify } = useDemo();
  const router = useRouter();
  const [pending, start] = useTransition();
  const now = zonedNow(state.profile.timezone);
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
      <PageHeader eyebrow={<span suppressHydrationWarning>{date}</span>} title={<span suppressHydrationWarning>Hoy</span>}>
        {!unpublished && (
          <Link href={`/${state.slug}`} target="_blank" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Ver mi carta <span className="sr-only">(nueva pestaña)</span>
          </Link>
        )}
      </PageHeader>
      {unpublished && (
        <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-line/70 bg-subtle p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.0625rem] font-semibold">Tu menú todavía no es público</h2>
            <p className="mt-0.5 type-help">
              Cargá tu carta y tus horarios en Menú y Ajustes. Cuando publiques, tu menú queda en sentate.com.ar/{state.slug}.
            </p>
          </div>
          <Button onClick={publish} pending={pending}>
            Publicar menú
          </Button>
        </section>
      )}
    </>
  );
}
