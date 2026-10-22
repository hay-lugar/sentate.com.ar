"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { featuredAction, reviewAction, subscriptionAction, suspensionAction, type AdminResult } from "@/app/superadmin/actions";
import { inputClass } from "@/components/menu/reservation/controls";
import { Button } from "@/components/ui/button";
import type { ModerationStatus } from "@/lib/explorer/profile";

export function ReviewPanel({ tenantId, moderation, suspended, featured }: { tenantId: string; moderation: ModerationStatus; suspended: boolean; featured: boolean }) {
  const uid = useId();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<AdminResult | null>(null);
  const n = Number(days);

  const run = async (key: string, fn: () => Promise<AdminResult>) => {
    setBusy(key);
    setMsg(null);
    const res = await fn();
    setBusy(null);
    setMsg(res);
    if (res.ok) {
      setReason("");
      router.refresh();
    }
  };

  return (
    <section aria-labelledby={`${uid}-t`} className="space-y-4 rounded-xl border border-line p-4">
      <h2 id={`${uid}-t`} className="type-section">Acciones</h2>
      <div>
        <label htmlFor={`${uid}-reason`} className="mb-1.5 block type-label">Motivo <span className="text-[13px] font-normal text-muted">Obligatorio salvo al aprobar. Lo ve el dueño en rechazos y correcciones.</span></label>
        <textarea id={`${uid}-reason`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} rows={3} className={`${inputClass} h-auto py-3`} />
      </div>

      <div className="space-y-2">
        <p className="type-label">Moderación</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run("approve", () => reviewAction(tenantId, "approve", reason))} pending={busy === "approve"} disabled={moderation !== "pending_review" || !!busy}>Aprobar</Button>
          <Button variant="secondary" onClick={() => run("changes", () => reviewAction(tenantId, "request_changes", reason))} pending={busy === "changes"} disabled={moderation !== "pending_review" || !!busy}>Pedir correcciones</Button>
          <Button variant="danger" onClick={() => run("reject", () => reviewAction(tenantId, "reject", reason))} pending={busy === "reject"} disabled={moderation !== "pending_review" || !!busy}>Rechazar</Button>
        </div>
        {moderation !== "pending_review" && <p className="type-help">Solo se resuelve lo que está en revisión.</p>}
      </div>

      <div className="space-y-2">
        <p className="type-label">Pausa (suspensión administrativa)</p>
        <Button variant={suspended ? "secondary" : "danger"} onClick={() => run("susp", () => suspensionAction(tenantId, !suspended, reason))} pending={busy === "susp"} disabled={!!busy}>
          {suspended ? "Reactivar comercio" : "Pausar comercio"}
        </Button>
        <p className="type-help">Pausar oculta la carta y el comercio del explorador. Las reservas existentes no se cancelan solas.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${uid}-days`} className="block type-label">Días (para extender, activar o destacar)</label>
        <input id={`${uid}-days`} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={`${inputClass} max-w-32`} />
        <p className="type-label pt-2">Suscripción (manual, hasta integrar el cobro)</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => run("ext", () => subscriptionAction(tenantId, "extend_trial", n, reason))} pending={busy === "ext"} disabled={!!busy}>Extender prueba</Button>
          <Button variant="secondary" onClick={() => run("act", () => subscriptionAction(tenantId, "activate", n, reason))} pending={busy === "act"} disabled={!!busy}>Activar período pago</Button>
          <Button variant="secondary" onClick={() => run("past", () => subscriptionAction(tenantId, "mark_past_due", 0, reason))} pending={busy === "past"} disabled={!!busy}>Marcar en mora</Button>
          <Button variant="danger" onClick={() => run("cancel", () => subscriptionAction(tenantId, "cancel", 0, reason))} pending={busy === "cancel"} disabled={!!busy}>Cancelar</Button>
        </div>
        <p className="type-help">El comercio no puede editar su estado de pago ni extender su prueba. Volver de una pantalla de pago no confirma nada: solo este panel (o un webhook verificado, a futuro) cambia el estado.</p>
      </div>

      <div className="space-y-2">
        <p className="type-label">Destacado (sin costo por ahora)</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => run("feat", () => featuredAction(tenantId, true, n, reason))} pending={busy === "feat"} disabled={!!busy}>{featured ? "Renovar destacado" : "Destacar"}</Button>
          {featured && <Button variant="quiet" onClick={() => run("unfeat", () => featuredAction(tenantId, false, 0, reason))} pending={busy === "unfeat"} disabled={!!busy}>Quitar destacado</Button>}
        </div>
        <p className="type-help">Aparece aparte del orden orgánico, con la etiqueta «Destacado», y respeta filtros y visibilidad. Máximo 90 días.</p>
      </div>

      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-[15px] text-success" : "text-[15px] text-danger"}>{msg.message}</p>}
    </section>
  );
}
