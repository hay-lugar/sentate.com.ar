import Link from "next/link";
import { CreateTenantForm } from "@/components/superadmin/forms";
import { Empty, Pager, SearchForm } from "@/components/superadmin/ui";
import { supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import { MODERATION_COPY, type ModerationStatus } from "@/lib/explorer/profile";
import { SUB_LABEL } from "@/lib/superadmin/format";

export const metadata = { title: "Superadmin · Comercios" };
const SIZE = 30;

type Row = { id: string; slug: string; name: string; moderation: ModerationStatus; tenant_status: string; is_published: boolean; subscription: string | null; owner_email: string | null; featured: boolean };

export default async function ComerciosPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 60);
  const page = Math.max(1, Math.min(300, Number(sp.p) || 1));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_moderation_queue", { p_status: "all", p_q: q || null, p_limit: SIZE, p_offset: (page - 1) * SIZE });
  if (error || !data) throw new TemporaryDataError("comercios");
  const { total, items } = data as { total: number; items: Row[] };
  return (
    <div className="space-y-6">
      <h1 className="type-title">Comercios</h1>
      <CreateTenantForm />
      <div>
        <SearchForm q={q} placeholder="Nombre o dirección web (slug)" />
        <p role="status" className="mb-3 type-help">{total} {total === 1 ? "comercio" : "comercios"}</p>
        {items.length === 0 ? <Empty>No hay comercios</Empty> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {items.map((r) => (
              <li key={r.id}>
                <Link href={`/superadmin/${r.id}`} className="flex flex-col gap-1 px-4 py-4 hover:bg-subtle sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">{r.name} <span className="font-normal text-muted">/{r.slug}</span></span>
                    <span className="block type-help">{r.owner_email ?? "sin dueño"}</span>
                  </span>
                  <span className="text-[13px] text-muted">
                    {[MODERATION_COPY[r.moderation].title, r.tenant_status === "suspended" ? "Pausado" : null, r.is_published ? "Publicado" : "Sin publicar", r.subscription ? `Suscripción ${SUB_LABEL[r.subscription] ?? r.subscription}` : null, r.featured ? "Destacado" : null].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pager base={`/superadmin/comercios${q ? `?q=${encodeURIComponent(q)}` : ""}`} page={page} total={total} size={SIZE} />
      </div>
    </div>
  );
}
