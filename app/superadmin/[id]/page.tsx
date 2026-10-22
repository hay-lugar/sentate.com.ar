import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DangerZone, PromotionPanel } from "@/components/superadmin/forms";
import { ReviewPanel } from "@/components/superadmin/review-panel";
import { ACTION_LABEL, fmt } from "@/lib/superadmin/format";
import { supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import { MISSING_LABELS, MODERATION_COPY, type ModerationStatus } from "@/lib/explorer/profile";


type Detail = {
  tenant: Record<string, string | boolean | null>;
  moderation: { status: ModerationStatus; reason: string; suspension_reason: string; submitted_at: string | null };
  location: { lat: number; lng: number; province_code: string; locality: string; neighborhood: string; confirmed_at: string | null } | null;
  cuisines: string[];
  subscription: { status: string; trial_ends_at: string; current_period_ends_at: string | null } | null;
  owners: string[];
  featured: { starts_at: string; ends_at: string; reason: string } | null;
  missing: string[];
  history: { at: string; action: string; by: string | null; detail: { reason?: string } }[];
};

type Extras = { promotion: { title: string; detail: string; starts_at: string; ends_at: string } | null; reservations: number; dishes: number };

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_tenant_detail", { p_tenant_id: id });
  if (error) throw new TemporaryDataError("ficha");
  if (!data) notFound();
  const d = data as Detail;
  const t = d.tenant;
  const { data: extrasData } = await supabase.rpc("admin_tenant_extras", { p_tenant_id: id });
  const extras = (extrasData as Extras | null) ?? { promotion: null, reservations: 0, dishes: 0 };

  return (
    <div className="space-y-8">
      <Link href="/superadmin/comercios" className="inline-flex min-h-11 items-center text-[15px] text-muted hover:text-foreground">← Comercios</Link>
      <div>
        <h1 className="type-title [overflow-wrap:anywhere]">{String(t.name)}</h1>
        <p className="type-help">/{String(t.slug)} · {MODERATION_COPY[d.moderation.status].title}{t.status === "suspended" ? " · Pausado" : ""}</p>
      </div>

      <section aria-labelledby="perfil" className="space-y-1 text-[15px]">
        <h2 id="perfil" className="mb-2 type-section">Perfil</h2>
        <Row k="Dueños" v={d.owners.join(", ") || "—"} />
        <Row k="Dirección" v={String(t.address || "—")} />
        <Row k="Ubicación" v={d.location ? `${d.location.locality}, ${d.location.province_code} (${d.location.lat.toFixed(5)}, ${d.location.lng.toFixed(5)}) · ${d.location.confirmed_at ? "confirmada" : "sin confirmar"}` : "Sin ubicación"} />
        <Row k="Tipo" v={String(t.business_type ?? "—")} />
        <Row k="Cocinas" v={d.cuisines.join(", ") || "—"} />
        <Row k="Teléfono del local" v={String(t.phone || "—")} />
        <Row k="Redes" v={[t.website_url, t.instagram_url, t.facebook_url].filter(Boolean).join(" · ") || "—"} />
        <Row k="Carta" v={t.is_published ? "Publicada" : "Sin publicar"} />
        {d.missing.length > 0 && <Row k="Falta" v={d.missing.map((m) => MISSING_LABELS[m] ?? m).join(", ")} />}
        {d.location && (
          <p className="pt-1"><a className="underline underline-offset-4" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${d.location.lat}&mlon=${d.location.lng}#map=17/${d.location.lat}/${d.location.lng}`}>Ver la ubicación en el mapa</a></p>
        )}
      </section>

      <section aria-labelledby="estado" className="space-y-1 text-[15px]">
        <h2 id="estado" className="mb-2 type-section">Estado</h2>
        <Row k="Moderación" v={`${MODERATION_COPY[d.moderation.status].title}${d.moderation.reason ? ` — ${d.moderation.reason}` : ""}`} />
        {d.moderation.suspension_reason && <Row k="Suspensión" v={d.moderation.suspension_reason} />}
        <Row k="Suscripción" v={d.subscription ? `${d.subscription.status} · prueba hasta ${fmt(d.subscription.trial_ends_at)}${d.subscription.current_period_ends_at ? ` · período hasta ${fmt(d.subscription.current_period_ends_at)}` : ""}` : "—"} />
        <Row k="Destacado" v={d.featured ? `Hasta ${fmt(d.featured.ends_at)} (${d.featured.reason})` : "No"} />
        <Row k="Promoción" v={extras.promotion ? `${extras.promotion.title} — hasta ${fmt(extras.promotion.ends_at)}` : "No"} />
        <Row k="Uso" v={`${extras.dishes} platos · ${extras.reservations} reservas`} />
      </section>

      <ReviewPanel tenantId={id} moderation={d.moderation.status} suspended={t.status === "suspended"} featured={!!d.featured} />

      <PromotionPanel tenantId={id} current={extras.promotion} />

      <DangerZone tenantId={id} slug={String(t.slug)} reservations={extras.reservations} dishes={extras.dishes} />

      <section aria-labelledby="hist">
        <h2 id="hist" className="mb-2 type-section">Historial</h2>
        {d.history.length === 0 ? <p className="text-[15px] text-muted">Sin movimientos.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {d.history.map((h, i) => (
              <li key={i} className="px-4 py-3 text-[15px]">
                <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span> <span className="text-muted">· {h.by ?? "sistema"} · {fmt(h.at)}</span>
                {h.detail?.reason && <span className="block type-help">Motivo: {h.detail.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <p className="flex gap-2"><span className="w-32 shrink-0 text-muted">{k}</span><span className="min-w-0 [overflow-wrap:anywhere]">{v}</span></p>;
}
