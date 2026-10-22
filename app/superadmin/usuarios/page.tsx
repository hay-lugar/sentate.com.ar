import { Empty, Pager, SearchForm } from "@/components/superadmin/ui";
import { supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import { fmt } from "@/lib/superadmin/format";

export const metadata = { title: "Superadmin · Usuarios" };
const SIZE = 30;
type Row = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; confirmed: boolean; tenants: number; is_admin: boolean };

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_users_list", { p_q: q || null, p_limit: SIZE, p_offset: (page - 1) * SIZE });
  if (error || !data) throw new TemporaryDataError("usuarios");
  const { total, items } = data as { total: number; items: Row[] };
  return (
    <div>
      <h1 className="mb-4 type-title">Usuarios</h1>
      <SearchForm q={q} placeholder="Buscar por email" />
      <p role="status" className="mb-3 type-help">{total} {total === 1 ? "cuenta" : "cuentas"}</p>
      {items.length === 0 ? <Empty>Sin resultados</Empty> : (
        <ul className="divide-y divide-line/70 rounded-2xl border border-line/70">
          {items.map((u) => (
            <li key={u.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><span className="font-medium">{u.email ?? "(sin email)"}</span>{u.is_admin && <span className="ml-2 rounded-md border border-line-strong px-1.5 py-1 text-[13px]">Superadmin</span>}</span>
              <span className="text-[14px] text-muted">{u.tenants} {u.tenants === 1 ? "comercio" : "comercios"} · alta {fmt(u.created_at)} · último ingreso {fmt(u.last_sign_in_at)}{u.confirmed ? "" : " · sin confirmar"}</span>
            </li>
          ))}
        </ul>
      )}
      <Pager base={`/superadmin/usuarios${q ? `?q=${encodeURIComponent(q)}` : ""}`} page={page} total={total} size={SIZE} />
    </div>
  );
}
