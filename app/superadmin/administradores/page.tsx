import { AddAdminForm, RemoveAdminButton } from "@/components/superadmin/forms";
import { getCurrentUser, supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import { fmt } from "@/lib/superadmin/format";

export const metadata = { title: "Superadmin · Administradores" };
type Row = { user_id: string; email: string | null; since: string };

export default async function AdministradoresPage() {
  const supabase = await supabaseServer();
  const me = await getCurrentUser();
  const { data, error } = await supabase.rpc("admin_list_admins");
  if (error || !data) throw new TemporaryDataError("administradores");
  const admins = data as Row[];
  return (
    <div className="space-y-6">
      <h1 className="type-title">Administradores</h1>
      <p className="type-help">Quienes pueden entrar a esta consola. Conviene tener pocos. Siempre queda al menos uno y nadie puede quitarse a sí mismo.</p>
      <ul className="divide-y divide-line/70 rounded-2xl border border-line/70">
        {admins.map((a) => (
          <li key={a.user_id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><span className="font-medium">{a.email}</span>{a.email === me?.email && <span className="ml-2 text-muted">(vos)</span>}<span className="block type-help">desde {fmt(a.since)}</span></span>
            {a.email !== me?.email && <RemoveAdminButton userId={a.user_id} email={a.email ?? ""} />}
          </li>
        ))}
      </ul>
      <AddAdminForm />
    </div>
  );
}
