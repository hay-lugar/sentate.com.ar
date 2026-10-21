"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { addBlockAction, removeBlockAction, saveSettingsAction } from "@/app/admin/[slug]/reservas/capacidad/actions";
import type { CapacitySettings } from "@/lib/admin/capacity-schema";
import { FieldError, inputClass } from "@/components/menu/reservation/controls";
import { Button } from "@/components/ui/button";

type Settings = CapacitySettings;
type Block = { id: string; starts_at: string; ends_at: string; reason: string };

const num = (v: string): number | null => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));

export function CapacityForm({ tenantId, timezone, initial, blocks }: { tenantId: string; timezone: string; initial: Settings; blocks: Block[] }) {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const router = useRouter();
  const [s, setS] = useState<Settings>(initial);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  const [date, setDate] = useState("");
  const [from, setFrom] = useState("20:00");
  const [to, setTo] = useState("23:59");
  const [reason, setReason] = useState("");
  const [blockError, setBlockError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    setError(null);
    const res = await saveSettingsAction(tenantId, s);
    setBusy(false);
    if (res.ok) {
      setMsg(res.message ?? "Guardado.");
      router.refresh();
    } else setError(res.message);
  };

  const fmt = (iso: string) => new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(new Date(iso));

  return (
    <div className="max-w-2xl space-y-10 pb-24">
      <section className="space-y-4">
        <h2 className="border-b border-line pb-3 type-section">Cupo</h2>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={s.acceptsReservations} onChange={(e) => set("acceptsReservations", e.target.checked)} className="size-5 accent-foreground" />
          <span className="text-[15px] font-medium">Recibir solicitudes de mesa por la web</span>
        </label>
        <div>
          <label htmlFor={id("cap")} className="mb-1.5 block type-label">Comensales simultáneos <span className="text-[13px] font-normal text-muted">Vacío = sin tope</span></label>
          <input id={id("cap")} inputMode="numeric" value={s.capacityGuests ?? ""} onChange={(e) => set("capacityGuests", num(e.target.value))} className={inputClass} />
          <p className="mt-1.5 type-help">Cuántas personas pueden estar a la vez. Es capacidad de personas, no mesas: no se asigna una mesa concreta.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Num id={id("party")} label="Máximo de personas por pedido" value={s.maxPartySize} onChange={(v) => set("maxPartySize", v ?? 8)} />
          <div>
            <label htmlFor={id("int")} className="mb-1.5 block type-label">Horarios cada</label>
            <select id={id("int")} value={s.slotIntervalMinutes} onChange={(e) => set("slotIntervalMinutes", Number(e.target.value) as 15 | 30 | 60)} className={inputClass}>
              <option value={30}>30 minutos</option>
              <option value={60}>60 minutos</option>
            </select>
          </div>
          <Num id={id("occ")} label="Duración de la reserva (min)" value={s.occupancyMinutes} onChange={(v) => set("occupancyMinutes", v ?? 90)} help="Cuánto tiempo ocupa el cupo. Las reservas se solapan por duración, no solo por hora de inicio." />
          <Num id={id("notice")} label="Anticipación mínima (min)" value={s.minNoticeMinutes} onChange={(v) => set("minNoticeMinutes", v ?? 30)} />
          <Num id={id("cut")} label="Corte de cocina (min antes del cierre)" value={s.kitchenCutoffMinutes} onChange={(v) => set("kitchenCutoffMinutes", v ?? 60)} help="La última reserva empieza este tiempo antes de que termine el turno." />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-line pb-3 type-section">Solicitudes pendientes</h2>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={s.holdPending} onChange={(e) => set("holdPending", e.target.checked)} className="size-5 accent-foreground" />
          <span className="text-[15px] font-medium">Una solicitud pendiente reserva cupo hasta que la respondas</span>
        </label>
        <Num id={id("hold")} label="Se libera sola a los (min)" value={s.pendingHoldMinutes} onChange={(v) => set("pendingHoldMinutes", v ?? 240)} help="Si no respondés en ese tiempo, la solicitud vence y el cupo se libera. Al rechazar o cancelar, se libera enseguida." />
        <p className="type-help">Cambiar esta configuración no modifica ni cancela las reservas que ya existen: solo afecta a los pedidos nuevos.</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} pending={busy} disabled={!dirty || busy}>Guardar</Button>
        {msg && <p role="status" className="text-[15px] text-success">{msg}</p>}
        {error && <p role="alert" className="text-[15px] text-danger">{error}</p>}
      </div>

      <section className="space-y-4">
        <h2 className="border-b border-line pb-3 type-section">Bloqueos</h2>
        <p className="type-help">Fechas u horarios en los que no se reciben reservas (hora de tu local). Para cerrar un día completo, usá cierres en Ajustes.</p>
        {blocks.length === 0 ? (
          <p className="text-[15px] text-muted">No hay bloqueos vigentes.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1 text-[15px]">
                  {fmt(b.starts_at)} → {fmt(b.ends_at)}
                  {b.reason && <span className="block type-help">{b.reason}</span>}
                </span>
                <Button variant="quiet" onClick={async () => { const r = await removeBlockAction(b.id); if (r.ok) router.refresh(); else setBlockError(r.message); }}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <label htmlFor={id("bdate")} className="mb-1.5 block type-label">Fecha</label>
            <input id={id("bdate")} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor={id("bfrom")} className="mb-1.5 block type-label">Desde</label>
            <input id={id("bfrom")} type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor={id("bto")} className="mb-1.5 block type-label">Hasta</label>
            <input id={id("bto")} type="time" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor={id("breason")} className="mb-1.5 block type-label">Motivo <span className="text-[13px] font-normal text-muted">Opcional</span></label>
          <input id={id("breason")} value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} className={inputClass} />
        </div>
        <FieldError id={id("berr")}>{blockError ?? undefined}</FieldError>
        <Button
          variant="secondary"
          disabled={!date}
          onClick={async () => {
            setBlockError(null);
            const r = await addBlockAction(tenantId, date, from, to, reason);
            if (r.ok) {
              setDate("");
              setReason("");
              router.refresh();
            } else setBlockError(r.message);
          }}
        >
          Agregar bloqueo
        </Button>
      </section>
    </div>
  );
}

function Num({ id, label, value, onChange, help }: { id: string; label: string; value: number; onChange: (v: number | null) => void; help?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block type-label">{label}</label>
      <input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(num(e.target.value))} className={inputClass} />
      {help && <p className="mt-1.5 type-help">{help}</p>}
    </div>
  );
}
