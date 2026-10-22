import { Stat } from "@/components/superadmin/ui";
import { supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import { SUB_LABEL } from "@/lib/superadmin/format";
import { MODERATION_COPY, type ModerationStatus } from "@/lib/explorer/profile";

export const metadata = { title: "Superadmin · Resumen" };

type Overview = {
  tenants: { total: number; published: number; suspended: number; listed: number; featured_active: number };
  moderation: Record<string, number>;
  subscriptions: Record<string, number>;
  trials_ending_7d: number;
  users: { total: number; last_7d: number; admins: number };
  reservations: { total: number; last_30d: number; by_status: Record<string, number> };
  dishes: number;
  payments: Record<string, number>;
  notifications: Record<string, number>;
};

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export default async function ResumenPage() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_platform_overview");
  if (error || !data) throw new TemporaryDataError("resumen");
  const o = data as Overview;
  return (
    <div className="space-y-8">
      <h1 className="type-title">Resumen de la plataforma</h1>
      <p className="type-help">Cifras reales de la base, al momento de abrir esta página. No hay métricas de uso (visitas) porque todavía no se miden.</p>
      <section aria-labelledby="com"><h2 id="com" className="mb-3 type-section">Comercios</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Total" value={o.tenants.total} />
          <Stat label="Publicados" value={o.tenants.published} />
          <Stat label="En el explorador" value={o.tenants.listed} />
          <Stat label="Pausados" value={o.tenants.suspended} />
          <Stat label="Destacados" value={o.tenants.featured_active} />
        </dl>
        <p className="mt-3 text-[15px] text-muted">Moderación: {Object.keys(o.moderation).length ? Object.entries(o.moderation).map(([k, n]) => `${MODERATION_COPY[k as ModerationStatus]?.title ?? k}: ${n}`).join(" · ") : "sin comercios"}</p>
      </section>
      <section aria-labelledby="sus"><h2 id="sus" className="mb-3 type-section">Suscripciones</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {["trialing", "active", "past_due", "canceled"].map((k) => <Stat key={k} label={SUB_LABEL[k][0].toUpperCase() + SUB_LABEL[k].slice(1)} value={o.subscriptions[k] ?? 0} />)}
          <Stat label="Pruebas que vencen en 7 días" value={o.trials_ending_7d} />
        </dl>
      </section>
      <section aria-labelledby="usr"><h2 id="usr" className="mb-3 type-section">Personas y uso</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Cuentas" value={o.users.total} note={`${o.users.last_7d} nuevas en 7 días`} />
          <Stat label="Administradores" value={o.users.admins} />
          <Stat label="Reservas" value={o.reservations.total} note={`${o.reservations.last_30d} en 30 días`} />
          <Stat label="Platos cargados" value={o.dishes} />
        </dl>
      </section>
      <section aria-labelledby="sis"><h2 id="sis" className="mb-3 type-section">Sistema</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Eventos de pago" value={sum(o.payments)} note="solo registro, sin cobros" />
          <Stat label="Avisos por email" value={sum(o.notifications)} note={`${o.notifications.sent ?? 0} enviados`} />
        </dl>
      </section>
    </div>
  );
}
