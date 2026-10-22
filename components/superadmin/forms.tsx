"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  addAdminAction, createTenantAction, deleteTenantAction, platformSettingAction, promotionAction, removeAdminAction, type AdminResult,
} from "@/app/superadmin/actions";
import { inputClass } from "@/components/menu/reservation/controls";
import { Button } from "@/components/ui/button";

type Res = AdminResult & { redirectTo?: string };

function useRunner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<AdminResult | null>(null);
  const run = async (fn: () => Promise<Res>, after?: () => void) => {
    setBusy(true);
    setMsg(null);
    const res = await fn();
    setBusy(false);
    setMsg(res);
    if (res.ok) {
      after?.();
      if (res.redirectTo) router.push(res.redirectTo);
      else router.refresh();
    }
  };
  return { busy, msg, run };
}

const Msg = ({ msg }: { msg: AdminResult | null }) =>
  msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-[0.9375rem] text-success" : "text-[0.9375rem] text-danger"}>{msg.message}</p> : null;

function Field({ label, hint, children, id }: { label: string; hint?: string; children: React.ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block type-label">
        {label} {hint && <span className="text-[0.8125rem] font-normal text-muted">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function CreateTenantForm() {
  const uid = useId();
  const { busy, msg, run } = useRunner();
  const [v, setV] = useState({ name: "", slug: "", email: "", why: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => createTenantAction(v.slug, v.name, v.email, v.why));
      }}
      className="space-y-4 rounded-2xl border border-line/70 p-4"
      aria-labelledby={`${uid}-t`}
    >
      <h2 id={`${uid}-t`} className="type-section">Crear restaurante</h2>
      <Field id={`${uid}-name`} label="Nombre"><input id={`${uid}-name`} value={v.name} onChange={set("name")} maxLength={60} required className={inputClass} /></Field>
      <Field id={`${uid}-slug`} label="Dirección web" hint="minúsculas, números y guiones"><input id={`${uid}-slug`} value={v.slug} onChange={set("slug")} maxLength={48} required className={inputClass} /></Field>
      <Field id={`${uid}-mail`} label="Email del dueño" hint="Vacío = quedás vos como dueño. Si lo completás, esa persona tiene que haberse registrado antes.">
        <input id={`${uid}-mail`} type="email" value={v.email} onChange={set("email")} maxLength={120} className={inputClass} />
      </Field>
      <Field id={`${uid}-why`} label="Razón" hint="Queda en la auditoría."><textarea id={`${uid}-why`} value={v.why} onChange={set("why")} maxLength={500} rows={2} required className={`${inputClass} h-auto py-3`} /></Field>
      <Button type="submit" pending={busy}>Crear restaurante</Button>
      <Msg msg={msg} />
    </form>
  );
}

export function PromotionPanel({ tenantId, current }: { tenantId: string; current: { title: string; detail: string; ends_at: string } | null }) {
  const uid = useId();
  const { busy, msg, run } = useRunner();
  const [title, setTitle] = useState(current?.title ?? "");
  const [detail, setDetail] = useState(current?.detail ?? "");
  const [days, setDays] = useState("14");
  const [why, setWhy] = useState("");
  return (
    <section aria-labelledby={`${uid}-t`} className="space-y-4 rounded-2xl border border-line/70 p-4">
      <h2 id={`${uid}-t`} className="type-section">Promoción</h2>
      <p className="type-help">Se muestra en la carta pública mientras está vigente y el comercio es visible. Una por comercio, hasta 90 días.</p>
      <Field id={`${uid}-title`} label="Título" hint="Ej.: 2x1 en pizzas"><input id={`${uid}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className={inputClass} /></Field>
      <Field id={`${uid}-detail`} label="Detalle" hint="Opcional, hasta 240 caracteres"><textarea id={`${uid}-detail`} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={240} rows={2} className={`${inputClass} h-auto py-3`} /></Field>
      <Field id={`${uid}-days`} label="Días de vigencia"><input id={`${uid}-days`} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={`${inputClass} max-w-32`} /></Field>
      <Field id={`${uid}-why`} label="Razón" hint="Queda en la auditoría."><input id={`${uid}-why`} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} className={inputClass} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button pending={busy} disabled={busy} onClick={() => run(() => promotionAction(tenantId, true, title, detail, Number(days), why))}>{current ? "Actualizar promoción" : "Publicar promoción"}</Button>
        {current && <Button variant="quiet" disabled={busy} onClick={() => run(() => promotionAction(tenantId, false, "", "", 0, why), () => { setTitle(""); setDetail(""); })}>Quitar promoción</Button>}
      </div>
      <Msg msg={msg} />
    </section>
  );
}

export function DangerZone({ tenantId, slug, reservations, dishes }: { tenantId: string; slug: string; reservations: number; dishes: number }) {
  const uid = useId();
  const { busy, msg, run } = useRunner();
  const [confirm, setConfirm] = useState("");
  const [why, setWhy] = useState("");
  return (
    <section aria-labelledby={`${uid}-t`} className="space-y-4 rounded-xl border border-danger/50 p-4">
      <h2 id={`${uid}-t`} className="type-section">Eliminar comercio</h2>
      <p className="text-[0.9375rem]">
        Borra <strong>definitivamente</strong> este comercio y todo lo suyo: {dishes} {dishes === 1 ? "plato" : "platos"}, {reservations} {reservations === 1 ? "reserva" : "reservas"}, horarios, membresías y favoritos. <strong>No se puede deshacer.</strong> Si solo querés sacarlo de circulación, usá «Pausar comercio».
      </p>
      <Field id={`${uid}-slug`} label={`Escribí «${slug}» para confirmar`}><input id={`${uid}-slug`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className={inputClass} /></Field>
      <Field id={`${uid}-why`} label="Razón" hint="Queda en la auditoría."><input id={`${uid}-why`} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} className={inputClass} /></Field>
      <Button variant="danger" pending={busy} disabled={busy || confirm !== slug || why.trim().length < 3} onClick={() => run(() => deleteTenantAction(tenantId, confirm, why))}>Eliminar definitivamente</Button>
      <Msg msg={msg} />
    </section>
  );
}

export function AddAdminForm() {
  const uid = useId();
  const { busy, msg, run } = useRunner();
  const [email, setEmail] = useState("");
  const [why, setWhy] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => addAdminAction(email, why), () => { setEmail(""); setWhy(""); });
      }}
      className="space-y-4 rounded-2xl border border-line/70 p-4"
      aria-labelledby={`${uid}-t`}
    >
      <h2 id={`${uid}-t`} className="type-section">Agregar administrador</h2>
      <Field id={`${uid}-mail`} label="Email" hint="La persona tiene que haberse registrado y confirmado su email."><input id={`${uid}-mail`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={120} className={inputClass} /></Field>
      <Field id={`${uid}-why`} label="Razón"><input id={`${uid}-why`} value={why} onChange={(e) => setWhy(e.target.value)} required maxLength={500} className={inputClass} /></Field>
      <Button type="submit" pending={busy}>Agregar</Button>
      <Msg msg={msg} />
    </form>
  );
}

export function RemoveAdminButton({ userId, email }: { userId: string; email: string }) {
  const { busy, msg, run } = useRunner();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="quiet"
        pending={busy}
        onClick={() => {
          const why = window.prompt(`Motivo para quitar a ${email} como administrador:`);
          if (why) void run(() => removeAdminAction(userId, why));
        }}
      >
        Quitar
      </Button>
      <Msg msg={msg} />
    </span>
  );
}

export function SettingPanel({ value }: { value: "visible" | "hidden" }) {
  const uid = useId();
  const { busy, msg, run } = useRunner();
  const [why, setWhy] = useState("");
  const next = value === "visible" ? "hidden" : "visible";
  return (
    <section aria-labelledby={`${uid}-t`} className="space-y-3 rounded-2xl border border-line/70 p-4">
      <h2 id={`${uid}-t`} className="type-section">Carta con acceso vencido</h2>
      <p className="text-[0.9375rem]">Hoy: <strong>{value === "visible" ? "la carta sigue visible" : "la carta se oculta"}</strong> cuando vence la prueba o la suscripción. Las reservas se bloquean en ambos casos.</p>
      <Field id={`${uid}-why`} label="Razón del cambio"><input id={`${uid}-why`} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} className={inputClass} /></Field>
      <Button variant="secondary" pending={busy} disabled={busy || why.trim().length < 3} onClick={() => run(() => platformSettingAction(next, why), () => setWhy(""))}>
        {next === "hidden" ? "Ocultar la carta al vencer" : "Mantener la carta visible al vencer"}
      </Button>
      <Msg msg={msg} />
    </section>
  );
}
