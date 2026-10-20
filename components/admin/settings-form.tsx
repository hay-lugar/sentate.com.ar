"use client";

import { AlertTriangle, CheckCircle2, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { Shift, TenantProfile } from "@/lib/domain/types";
import { PROFILE_LIMITS, validateProfile, type ProfileErrors } from "@/lib/demo/profile-validation";
import { readableOn, themeContrastReport, themeStyle } from "@/lib/theme";
import { fromMinutes, TIMEZONE_OPTIONS } from "@/lib/time/zoned";
import { cn } from "@/lib/format";
import { FieldError, inputClass } from "@/components/menu/reservation/controls";
import { TenantLogo } from "@/components/ui/tenant-logo";
import { useDemo } from "./demo-provider";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function SettingsForm() {
  const { state, dispatch, notify, mode } = useDemo();
  const live = mode === "live";
  const [draft, setDraft] = useState<TenantProfile>(state.profile);
  const [source, setSource] = useState(state.profile);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const uid = useId();

  // Si el perfil cambia desde afuera (hidratación o "Restablecer demo"), recarga el formulario.
  if (state.profile !== source) {
    setSource(state.profile);
    setDraft(state.profile);
    setErrors({});
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(state.profile);
  const set = <K extends keyof TenantProfile>(key: K, value: TenantProfile[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setShifts = (shifts: Shift[]) => setDraft((d) => ({ ...d, schedule: { ...d.schedule, shifts } }));
  const setColor = (key: "primary" | "accent", hex: string) =>
    setDraft((d) => ({
      ...d,
      theme:
        key === "primary"
          ? { ...d.theme, primary: hex, primaryForeground: readableOn(hex) }
          : { ...d.theme, accent: hex, accentForeground: readableOn(hex) },
    }));

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return setErrors((e) => ({ ...e, logo: "Usá una imagen PNG, JPG o WebP." }));
    if (file.size > PROFILE_LIMITS.logoMaxBytes) return setErrors((e) => ({ ...e, logo: "La imagen supera los 200 KB." }));
    const reader = new FileReader();
    reader.onload = () => {
      set("logoUrl", String(reader.result));
      setErrors((e) => ({ ...e, logo: undefined }));
    };
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = { ...draft, name: draft.name.trim(), tagline: draft.tagline.trim(), cuisine: draft.cuisine.trim(), address: draft.address.trim() };
    const errs = validateProfile(next);
    setErrors(errs);
    if (Object.keys(errs).length) {
      notify("Revisá los campos marcados", "error");
      return;
    }
    dispatch({ type: "updateProfile", profile: next });
    notify(live ? "Guardando ajustes…" : "Ajustes guardados en este navegador", live ? "neutral" : "ok");
  };

  const contrast = themeContrastReport(draft.theme);
  const id = (k: string) => `${uid}-${k}`;

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 pb-24 lg:grid-cols-2">
      {/* Datos del local */}
      <Card title="Tu local">
        <div className="mb-4 flex items-center gap-4">
          <TenantLogo name={draft.name || "?"} logoUrl={draft.logoUrl} className="size-16 rounded-2xl text-xl ring-1 ring-line" />
          <div className="flex flex-wrap gap-2">
            {!live && (
            <label className="pressable inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-background px-3 text-[13px] font-semibold ring-1 ring-line focus-within:ring-2 focus-within:ring-brand">
              <ImagePlus className="size-4" aria-hidden />
              {draft.logoUrl ? "Cambiar logo" : "Subir logo"}
              <input type="file" accept={LOGO_TYPES.join(",")} className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
            </label>
            )}
            {draft.logoUrl && (
              <button type="button" onClick={() => set("logoUrl", undefined)} className="pressable h-10 rounded-xl px-3 text-[13px] font-semibold text-rose-700 hover:bg-rose-50">
                Quitar logo
              </button>
            )}
          </div>
        </div>
        <p className="-mt-2 mb-4 text-[12px] text-muted">
          {live
            ? "La subida de logos llega en la próxima versión. Mientras tanto se muestran las iniciales."
            : "Opcional. PNG, JPG o WebP hasta 200 KB. Sin logo se muestran las iniciales."}
        </p>
        <FieldError id={id("logo-error")}>{errors.logo}</FieldError>

        <div className="space-y-3">
          <TextField id={id("name")} label="Nombre del local" value={draft.name} onChange={(v) => set("name", v)} error={errors.name} />
          <TextField id={id("tagline")} label="Descripción corta" optional value={draft.tagline} onChange={(v) => set("tagline", v)} error={errors.tagline} />
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <TextField id={id("cuisine")} label="Tipo de cocina" value={draft.cuisine} onChange={(v) => set("cuisine", v)} error={errors.cuisine} />
            <div>
              <label htmlFor={id("price")} className="mb-1.5 block px-1 text-[13px] font-semibold">
                Precios
              </label>
              <select
                id={id("price")}
                value={draft.priceRange}
                onChange={(e) => set("priceRange", e.target.value as TenantProfile["priceRange"])}
                className={cn(inputClass, "w-24")}
              >
                <option value="$">$</option>
                <option value="$$">$$</option>
                <option value="$$$">$$$</option>
              </select>
            </div>
          </div>
          <TextField id={id("address")} label="Dirección" value={draft.address} onChange={(v) => set("address", v)} error={errors.address} />
          <TextField id={id("phone")} label="Teléfono del local" type="tel" value={draft.phone} onChange={(v) => set("phone", v)} error={errors.phone} />
        </div>
      </Card>

      {/* Horarios */}
      <Card title="Horarios">
        <div>
          <label htmlFor={id("tz")} className="mb-1.5 block px-1 text-[13px] font-semibold">
            Zona horaria del local
          </label>
          <select id={id("tz")} value={draft.timezone} onChange={(e) => set("timezone", e.target.value)} className={inputClass}>
            {TIMEZONE_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 px-1 text-[12px] text-muted">Estado abierto/cerrado y calendario de reservas usan esta zona.</p>
        </div>

        <fieldset className="mt-5" aria-describedby={errors.openDays ? id("days-error") : undefined}>
          <legend className="mb-2 px-1 text-[13px] font-semibold">Días de apertura</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((d, i) => {
              const on = draft.schedule.openDays.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_NAMES[i]}
                  onClick={() =>
                    set("schedule", {
                      ...draft.schedule,
                      openDays: on ? draft.schedule.openDays.filter((x) => x !== i) : [...draft.schedule.openDays, i].sort(),
                    })
                  }
                  className={cn("pressable h-11 rounded-xl text-[12px] font-semibold ring-1", on ? "bg-brand text-brand-fg ring-brand" : "bg-surface ring-line")}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <FieldError id={id("days-error")}>{errors.openDays}</FieldError>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-2 px-1 text-[13px] font-semibold">Turnos</legend>
          <p className="mb-3 px-1 text-[12px] text-muted">
            Si un turno cierra después de medianoche (ej. 20:00–00:30), esos horarios pertenecen al día en que abrió.
          </p>
          <ul className="space-y-2">
            {draft.schedule.shifts.map((s, i) => (
              <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-2xl bg-background p-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <div className="col-span-3 sm:col-span-1">
                  <label htmlFor={id(`shift-${i}-label`)} className="mb-1 block px-1 text-[11px] font-semibold text-muted">
                    Nombre del turno
                  </label>
                  <input
                    id={id(`shift-${i}-label`)}
                    value={s.label}
                    onChange={(e) => setShifts(draft.schedule.shifts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    className={cn(inputClass, "h-11 bg-surface")}
                  />
                </div>
                <TimeInput id={id(`shift-${i}-open`)} label="Abre" value={s.open} onChange={(v) => setShifts(draft.schedule.shifts.map((x, j) => (j === i ? { ...x, open: v } : x)))} />
                <TimeInput id={id(`shift-${i}-close`)} label="Cierra" value={s.close} onChange={(v) => setShifts(draft.schedule.shifts.map((x, j) => (j === i ? { ...x, close: v } : x)))} />
                <button
                  type="button"
                  aria-label={`Quitar turno ${s.label || i + 1}`}
                  onClick={() => setShifts(draft.schedule.shifts.filter((_, j) => j !== i))}
                  className="pressable grid size-11 place-items-center rounded-xl text-muted hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {draft.schedule.shifts.length < PROFILE_LIMITS.maxShifts && (
            <button
              type="button"
              onClick={() =>
                setShifts([...draft.schedule.shifts, { id: `turno-${Date.now()}`, label: "Nuevo turno", open: "12:00", close: "15:00" }])
              }
              className="pressable mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-brand hover:bg-brand-soft"
            >
              <Plus className="size-4" aria-hidden /> Agregar turno
            </button>
          )}
          <FieldError id={id("shifts-error")}>{errors.shifts}</FieldError>
        </fieldset>
      </Card>

      {/* Identidad visual */}
      <Card title="Colores" className="lg:col-span-2">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <ColorField id={id("primary")} label="Color principal" value={draft.theme.primary} onChange={(v) => setColor("primary", v)} error={errors.primary} />
            <ColorField id={id("accent")} label="Color de acento (fondos suaves)" value={draft.theme.accent} onChange={(v) => setColor("accent", v)} error={errors.accent} />
            <ul className="space-y-1.5 text-[13px]" aria-label="Contraste de colores">
              {contrast.map((c) => (
                <li key={c.label} className={cn("flex items-center gap-2", c.ok ? "text-emerald-800" : "text-rose-800")}>
                  {c.ok ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
                  {c.label}: {c.ratio.toFixed(1)}:1 {c.ok ? "(AA)" : "(bajo, mínimo 4.5)"}
                </li>
              ))}
            </ul>
          </div>
          <div style={themeStyle(draft.theme)} className="rounded-[1.6rem] bg-accent p-4" aria-label="Vista previa" role="img">
            <div className="flex items-center gap-3">
              <TenantLogo name={draft.name || "?"} logoUrl={draft.logoUrl} className="size-12 rounded-2xl" />
              <div className="min-w-0 leading-tight">
                <p className="truncate font-display text-lg font-bold text-accent-fg">{draft.name || "Tu local"}</p>
                <p className="truncate text-[13px] text-accent-fg">{draft.cuisine}</p>
              </div>
            </div>
            <div className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-brand text-[14px] font-bold text-brand-fg shadow-brand">Reservar mesa</div>
          </div>
        </div>
      </Card>

      {/* Barra de guardado: solo con cambios pendientes, para no tapar campos en mobile */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 lg:bottom-6 lg:left-auto lg:right-8">
          <div className="flex items-center gap-3 rounded-2xl bg-surface p-2 pl-4 shadow-lift ring-1 ring-line/70">
            <span className="text-[13px] font-medium text-muted" role="status">
              Cambios sin guardar
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(state.profile);
                setErrors({});
              }}
              className="pressable h-11 rounded-xl px-3 text-[14px] font-semibold disabled:opacity-40"
            >
              Descartar
            </button>
            <button type="submit" className="pressable h-11 rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-fg shadow-brand">
              Guardar
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function Card({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-[1.75rem] bg-surface p-5 shadow-soft ring-1 ring-line/70", className)}>
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  optional,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  optional?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex justify-between px-1 text-[13px] font-semibold">
        {label}
        {optional && <span className="text-[12px] font-medium text-muted">Opcional</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

// Selector HH:MM explícito (24 h, cada 15'): evita que el input nativo cambie de formato según el locale.
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => fromMinutes(i * 15));

function TimeInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const options = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [value, ...TIME_OPTIONS];
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block px-1 text-[11px] font-semibold text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "h-11 w-full min-w-0 bg-surface px-3 tabular-nums sm:w-[6.5rem]")}
      >
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

function ColorField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block px-1 text-[13px] font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-12 w-16 cursor-pointer rounded-xl border-0 bg-transparent p-0"
        />
        <code className="rounded-lg bg-background px-2 py-1 text-[13px] font-semibold uppercase">{value}</code>
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
