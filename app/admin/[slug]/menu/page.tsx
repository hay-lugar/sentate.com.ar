import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { MenuManager } from "@/components/admin/menu-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getTenant } from "@/data/mock";

export const metadata = { title: "Menú" };

export default async function MenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = getTenant((await params).slug);
  if (!tenant) notFound();

  return (
    <>
      <PageHeader eyebrow="Tu carta" title="Menú">
        <button
          type="button"
          className="pressable inline-flex h-11 items-center gap-2 rounded-2xl bg-brand px-4 text-[14px] font-semibold text-brand-fg shadow-brand"
        >
          <Plus className="size-4" /> Nueva categoría
        </button>
      </PageHeader>
      <MenuManager initial={tenant.categories} />
    </>
  );
}
