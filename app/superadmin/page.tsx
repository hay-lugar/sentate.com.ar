import Link from "next/link";
import { supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import { cn } from "@/lib/format";
import { MODERATION_COPY, type ModerationStatus } from "@/lib/explorer/profile";

const TABS: { id: string; label: string }[] = [
  { id: "pending_review", label: "En revisión" },
  { id: "changes_requested", label: "Correcciones" },
  { id: "approved", label: "Aprobados" },
  { id: "rejected", label: "Rechazados" },
  { id: "draft", label: "Borradores" },
  { id: "all", label: "Todos" },
];

type Row = {
  id: string; slug: string; name: string; business_type: string | null; moderation: ModerationStatus; tenant_status: string; is_published: boolean;
  locality: string | null; location_confirmed: boolean; subscription: string | null; owner_email: string | null; submitted_at: string | null; featured: boolean;
};

export default async function BandejaPage({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string }> }) {
  const sp = await searchParams;
  const estado = TABS.some((t) => t.id === sp.estado) ? (sp.estado as string) : "pending_review";
  const q = (sp.q ?? "").slice(0, 60);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_moderation_queue", { p_status: estado, p_q: q || null, p_limit: 50, p_offset: 0 });
  if (error || !data) throw new TemporaryDataError("bandeja");
  const { total, items } = data as { total: number; items: Row[] };

  return (
    <div>
      <h1 className="mb-4 type-title">Bandeja de moderación</h1>
      <form role="search" className="mb-4 flex gap-2">
        <input type="hidden" name="estado" value={estado} />
        <label htmlFor="q" className="sr-only">Buscar comercio</label>
        <input id="q" name="q" defaultValue={q} placeholder="Nombre o dirección web" className="h-12 min-w-0 flex-1 rounded-xl bg-surface px-4 text-[16px] ring-1 ring-field outline-none focus:ring-2 focus:ring-foreground" />
        <button type="submit" className="pressable h-12 rounded-xl bg-foreground px-5 text-[15px] font-medium text-background">Buscar</button>
      </form>
      <nav aria-label="Estado" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <Link key={t.id} href={`/superadmin?estado=${t.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={estado === t.id ? "page" : undefined}
            className={cn("inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[14px]", estado === t.id ? "border-foreground bg-foreground font-medium text-background" : "border-line-strong hover:bg-subtle")}>
            {t.label}
          </Link>
        ))}
      </nav>
      <p role="status" className="mb-3 type-help">{total} {total === 1 ? "comercio" : "comercios"}</p>
      {items.length === 0 ? (
        <div className="rounded-xl border border-line px-6 py-10 text-center"><p className="text-[17px] font-semibold">Nada por revisar</p></div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/superadmin/${r.id}`} className="flex flex-col gap-1 px-4 py-4 hover:bg-subtle sm:flex-row sm:items-center sm:gap-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold [overflow-wrap:anywhere]">{r.name} <span className="font-normal text-muted">/{r.slug}</span></span>
                  <span className="block type-help">{[r.owner_email, r.locality, r.business_type].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="flex flex-wrap gap-1.5 text-[13px]">
                  <Tag>{MODERATION_COPY[r.moderation].title}</Tag>
                  {r.tenant_status === "suspended" && <Tag danger>Suspendido</Tag>}
                  {!r.is_published && <Tag>Sin publicar</Tag>}
                  {r.subscription && <Tag>Suscripción: {r.subscription}</Tag>}
                  {r.featured && <Tag>Destacado</Tag>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tag({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return <span className={cn("rounded-md border px-1.5 py-1 leading-none", danger ? "border-danger/50 text-danger" : "border-line-strong text-muted")}>{children}</span>;
}
