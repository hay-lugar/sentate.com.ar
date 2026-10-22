import { SettingPanel } from "@/components/superadmin/forms";
import { supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import { fmt } from "@/lib/superadmin/format";

export const metadata = { title: "Superadmin · Sistema" };
type Status = {
  settings: { public_menu_when_access_lapsed: "visible" | "hidden"; notifications_secret_set: boolean; payments_secret_set: boolean };
  payment_events: { at: string; provider: string; kind: string; status: string; resource_id: string | null; error: string | null }[];
  notifications: { at: string; kind: string; status: string; attempts: number; recipient: string; error: string | null }[];
};

export default async function SistemaPage() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_system_status");
  if (error || !data) throw new TemporaryDataError("sistema");
  const s = data as Status;
  return (
    <div className="space-y-8">
      <h1 className="type-title">Sistema</h1>
      <SettingPanel value={s.settings.public_menu_when_access_lapsed} />
      <section aria-labelledby="int"><h2 id="int" className="mb-2 type-section">Integraciones</h2>
        <ul className="space-y-1 text-[0.9375rem]">
          <li>Avisos por email: secreto del despachador {s.settings.notifications_secret_set ? "configurado" : "sin configurar"}. Sin proveedor activo no se envía nada.</li>
          <li>Pagos (Mercado Pago): secreto del webhook {s.settings.payments_secret_set ? "configurado" : "sin configurar"}. Solo se registran eventos; no se cobra.</li>
        </ul>
      </section>
      <section aria-labelledby="pay"><h2 id="pay" className="mb-2 type-section">Últimos eventos de pago</h2>
        {s.payment_events.length === 0 ? <p className="text-[0.9375rem] text-muted">Ninguno.</p> : (
          <ul className="divide-y divide-line/70 rounded-2xl border border-line/70">{s.payment_events.map((e, i) => <li key={i} className="px-4 py-3 text-[0.9375rem]">{e.provider} · {e.kind} · {e.status}{e.resource_id ? ` · ${e.resource_id}` : ""} <span className="text-muted">· {fmt(e.at)}</span>{e.error && <span className="block type-help">{e.error}</span>}</li>)}</ul>
        )}
      </section>
      <section aria-labelledby="nt"><h2 id="nt" className="mb-2 type-section">Últimos avisos por email</h2>
        {s.notifications.length === 0 ? <p className="text-[0.9375rem] text-muted">Ninguno.</p> : (
          <ul className="divide-y divide-line/70 rounded-2xl border border-line/70">{s.notifications.map((n, i) => <li key={i} className="px-4 py-3 text-[0.9375rem]">{n.kind} · {n.status} · {n.attempts} {n.attempts === 1 ? "intento" : "intentos"} · {n.recipient} <span className="text-muted">· {fmt(n.at)}</span>{n.error && <span className="block type-help">{n.error}</span>}</li>)}</ul>
        )}
      </section>
    </div>
  );
}
