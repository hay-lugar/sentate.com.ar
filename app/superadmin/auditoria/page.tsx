import Link from "next/link";
import { Empty, Pager } from "@/components/superadmin/ui";
import { supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import { ACTION_LABEL, fmt } from "@/lib/superadmin/format";

export const metadata = { title: "Superadmin · Auditoría" };
const SIZE = 40;
type Item = { id: number; at: string; action: string; actor: string | null; tenant_id: string | null; tenant_name: string | null; detail: Record<string, unknown> };

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ a?: string; p?: string }> }) {
  const sp = await searchParams;
  const action = (sp.a ?? "").slice(0, 60);
  const page = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_audit_log_list", { p_action: action || null, p_limit: SIZE, p_offset: (page - 1) * SIZE });
  if (error || !data) throw new TemporaryDataError("auditoría");
  const { total, actions, items } = data as { total: number; actions: string[]; items: Item[] };
  return (
    <div>
      <h1 className="mb-1 type-title">Auditoría</h1>
      <p className="mb-4 type-help">Todo lo que hace un superadministrador queda acá: quién, cuándo, qué y por qué. No se puede editar ni borrar desde la app.</p>
      <form className="mb-4 flex gap-2">
        <label htmlFor="a" className="sr-only">Filtrar por acción</label>
        <select id="a" name="a" defaultValue={action} className="h-12 min-w-0 flex-1 rounded-xl bg-surface px-3 text-[1rem] ring-1 ring-field">
          <option value="">Todas las acciones</option>
          {actions.map((x) => <option key={x} value={x}>{ACTION_LABEL[x] ?? x}</option>)}
        </select>
        <button type="submit" className="pressable h-12 rounded-xl bg-foreground px-5 text-[0.9375rem] font-medium text-background">Filtrar</button>
      </form>
      <p role="status" className="mb-3 type-help">{total} {total === 1 ? "registro" : "registros"}</p>
      {items.length === 0 ? <Empty>Sin movimientos</Empty> : (
        <ul className="divide-y divide-line/70 rounded-2xl border border-line/70">
          {items.map((i) => (
            <li key={i.id} className="px-4 py-3 text-[0.9375rem]">
              <span className="font-medium">{ACTION_LABEL[i.action] ?? i.action}</span>
              {i.tenant_id && (i.tenant_name ? <> · <Link href={`/superadmin/${i.tenant_id}`} className="underline underline-offset-4">{i.tenant_name}</Link></> : <> · {String(i.detail.name ?? i.detail.slug ?? "comercio eliminado")}</>)}
              <span className="text-muted"> · {i.actor ?? "sistema"} · {fmt(i.at)}</span>
              {typeof i.detail.reason === "string" && <span className="block type-help">Motivo: {i.detail.reason}</span>}
            </li>
          ))}
        </ul>
      )}
      <Pager base={`/superadmin/auditoria${action ? `?a=${encodeURIComponent(action)}` : ""}`} page={page} total={total} size={SIZE} />
    </div>
  );
}
