import Link from "next/link";
import { notFound } from "next/navigation";
import { BulkPriceEditor } from "@/components/admin/bulk-price-editor";
import { PageHeader } from "@/components/admin/page-header";
import { getTenantRecord } from "@/lib/data/tenants";
import { getCurrentUser, supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import type { BulkItem } from "@/lib/admin/bulk-price";

export const metadata = { title: "Cambiar precios" };
export const dynamic = "force-dynamic";

export default async function PreciosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const back = (
    <Link href={`/admin/${slug}/menu`} className="inline-flex min-h-11 items-center text-[15px] text-muted hover:text-foreground">
      ← Menú
    </Link>
  );
  if (getTenantRecord(slug)) {
    return (
      <>
        {back}
        <PageHeader title="Cambiar precios" />
        <p className="max-w-xl text-[15px] text-muted">El cambio masivo de precios usa datos reales y no está disponible en la demo.</p>
      </>
    );
  }
  if (!(await getCurrentUser())) notFound();
  const supabase = await supabaseServer();
  const { data: tenant, error } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new TemporaryDataError("precios");
  if (!tenant) notFound();
  const [cats, items] = await Promise.all([
    supabase.from("categories").select("id, name, position").eq("tenant_id", tenant.id).order("position"),
    supabase.from("menu_items").select("id, category_id, name, price, updated_at, position").eq("tenant_id", tenant.id).order("position"),
  ]);
  if (cats.error || items.error) throw new TemporaryDataError("precios");
  const catName = new Map(cats.data.map((c) => [c.id as string, c.name as string]));
  const order = new Map(cats.data.map((c, i) => [c.id as string, i]));
  const list: BulkItem[] = items.data
    .map((i) => ({ id: i.id as string, name: i.name as string, category: catName.get(i.category_id as string) ?? "", price: Number(i.price), version: i.updated_at as string, o: order.get(i.category_id as string) ?? 0, p: i.position as number }))
    .sort((a, b) => a.o - b.o || a.p - b.p)
    .map(({ id, name, category, price, version }) => ({ id, name, category, price, version }));
  return (
    <>
      {back}
      <PageHeader title="Cambiar precios" />
      <BulkPriceEditor tenantId={tenant.id} items={list} />
    </>
  );
}
