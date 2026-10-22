import Link from "next/link";
import { Empty, Pager, Tabs } from "@/components/superadmin/ui";
import { supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import { fmt, SUB_LABEL } from "@/lib/superadmin/format";

export const metadata = { title: "Superadmin · Suscripciones" };
const SIZE = 30;
const TABS = [
  { id: "trial_ending", label: "Pruebas por vencer (14 días)" }, { id: "trialing", label: "En prueba" }, { id: "active", label: "Activas" },
  { id: "past_due", label: "En mora" }, { id: "canceled", label: "Canceladas" }, { id: "all", label: "Todas" },
];
type Row = { id: string; slug: string; name: string; status: string; trial_ends_at: string | null; current_period_ends_at: string | null; owner_email: string | null };

export default async function SuscripcionesPage({ searchParams }: { searchParams: Promise<{ f?: string; p?: string }> }) {
  const sp = await searchParams;
  const f = TABS.some((t) => t.id === sp.f) ? (sp.f as string) : "trial_ending";
  const page = Math.max(1, Math.min(300, Number(sp.p) || 1));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_subscriptions_list", { p_filter: f, p_limit: SIZE, p_offset: (page - 1) * SIZE });
  if (error || !data) throw new TemporaryDataError("suscripciones");
  const { total, items } = data as { total: number; items: Row[] };
  return (
    <div>
      <h1 className="mb-1 type-title">Suscripciones</h1>
      <p className="mb-4 type-help">El estado se administra a mano desde la ficha de cada comercio; hoy no hay cobro automático.</p>
      <Tabs current="Estado" items={TABS.map((t) => ({ href: `/superadmin/suscripciones?f=${t.id}`, label: t.label, active: f === t.id }))} />
      <p role="status" className="mb-3 type-help">{total} {total === 1 ? "suscripción" : "suscripciones"}</p>
      {items.length === 0 ? <Empty>Nada en esta vista</Empty> : (
        <ul className="divide-y divide-line/70 rounded-2xl border border-line/70">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/superadmin/${r.id}`} className="flex flex-col gap-1 px-4 py-4 hover:bg-subtle sm:flex-row sm:items-center sm:gap-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold [overflow-wrap:anywhere]">{r.name} <span className="font-normal text-muted">/{r.slug}</span></span>
                  <span className="block type-help">{r.owner_email ?? "sin dueño"}</span>
                </span>
                <span className="text-[14px]">{SUB_LABEL[r.status] ?? r.status} · prueba hasta {fmt(r.trial_ends_at)}{r.current_period_ends_at ? ` · período hasta ${fmt(r.current_period_ends_at)}` : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager base={`/superadmin/suscripciones?f=${f}`} page={page} total={total} size={SIZE} />
    </div>
  );
}
