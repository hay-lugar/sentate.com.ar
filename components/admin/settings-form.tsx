"use client";

import { AlertTriangle, CheckCircle2, ImagePlus, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { TenantProfile } from "@/lib/domain/types";
import { PROFILE_LIMITS, validateProfileInfo, validateSchedule, type ProfileErrors } from "@/lib/demo/profile-validation";
import { readableOn, themeContrastReport, themeStyle } from "@/lib/theme";
import { TIMEZONE_OPTIONS } from "@/lib/time/zoned";
import { cn } from "@/lib/format";
import { FieldError, inputClass } from "@/components/menu/reservation/controls";
import { TenantLogo } from "@/components/ui/tenant-logo";
import { useDemo } from "./demo-provider";
import { CoverField } from "./cover-field";
import { ImageUploader } from "./image-uploader";
import { ScheduleEditor } from "./schedule-editor";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SettingsForm() {
  const { state, saveSettings, notify, mode, live: liveInfo } = useDemo();
  const router = useRouter();
  const live = mode === "live";
  const [draft, setDraft] = useState<TenantProfile>(state.profile);
  const [source, setSource] = useState(state.profile);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [submitting, setSubmitting] = useState(false);
  /** Los ajustes cambiaron en otra sesión mientras había cambios sin guardar acá. */
  const [externalChange, setExternalChange] = useState(false);
  const uid = useId();

  const dirty = !same(draft, state.profile);
  const scheduleDirty = !same(draft.schedule, state.profile.schedule);

  // Si el perfil cambia desde afuera (hidratación, "Restablecer demo", guardado propio o de otra
  // sesión): sin cambios locales se recarga el formulario; con cambios, se avisa y NO se pisan.
  if (state.profile !== source) {
    setSource(state.profile);
    if (!same(state.profile, source)) {
      if (!same(draft, source) && !same(draft, state.profile)) setExternalChange(true);
      else {
        setDraft(state.profile);
        setErrors({});
      }
    }
  }

  const set = <K extends keyof TenantProfile>(key: K, value: TenantProfile[K]) => setDraft((d) => ({ ...d, [key]: value }));
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const next = { ...draft, name: draft.name.trim(), tagline: draft.tagline.trim(), cuisine: draft.cuisine.trim(), address: draft.address.trim() };
    // Los horarios se validan (y se envían) solo si cambiaron: guardar colores no toca turnos.
    const errs = { ...validateProfileInfo(next), ...(scheduleDirty ? validateSchedule(next.schedule) : {}) };
    setErrors(errs);
    if (Object.keys(errs).length) {
      notify("Revisá los campos marcados", "error");
      return;
    }
    setDraft(next);
    setSubmitting(true);
    const res = await saveSettings(next, scheduleDirty);
    setSubmitting(false);
    if (res.ok) setExternalChange(false);
    else if (res.code === "stale") setExternalChange(true);
  };

  const discard = () => {
    setDraft(state.profile);
    setErrors({});
    setExternalChange(false);
  };

  const contrast = themeContrastReport(draft.theme);
  const id = (k: string) => `${uid}-${k}`;

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 pb-24 lg:grid-cols-2">
      {/* Datos del local */}
      <Card title="Tu local">
        {liveInfo ? (
          <div className="mb-5 space-y-5 border-b border-line/70 pb-5">
            <div role="group" aria-labelledby={id("logo-label")}>
              <p id={id("logo-label")} className="mb-2 px-1 text-[13px] font-semibold">
                Logo <span className="text-[12px] font-medium text-muted">Opcional · se guarda con «Guardar cambios»</span>
              </p>
              <ImageUploader tenantId={liveInfo.tenantId} kind="logo" value={draft.logoUrl ?? null} onChange={(path) => set("logoUrl", path ?? undefined)} />
            </div>
            <div role="group" aria-labelledby={id("cover-label")}>
              <p id={id("cover-label")} className="mb-2 px-1 text-[13px] font-semibold">
                Portada <span className="text-[12px] font-medium text-muted">Opcional · se guarda al subirla</span>
              </p>
              <CoverField live={liveInfo} />
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}

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

        <div className="mt-5">
          <ScheduleEditor
            idPrefix={id("schedule")}
            schedule={draft.schedule}
            timeZone={draft.timezone}
            errors={errors}
            onChange={(schedule) => set("schedule", schedule)}
          />
        </div>
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

      {externalChange && (
        <div role="alert" className="flex flex-col gap-3 rounded-[1.75rem] bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200 sm:flex-row sm:items-center lg:col-span-2">
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px]">
            Los ajustes se modificaron en otra pestaña o dispositivo. Para no pisar esos cambios, descartá los tuyos y volvé a editar.
          </p>
          <button
            type="button"
            onClick={() => {
              discard();
              router.refresh();
            }}
            className="pressable inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-amber-900 px-4 text-[14px] font-semibold text-white"
          >
            <RefreshCw className="size-4" aria-hidden /> Ver la versión actual
          </button>
        </div>
      )}

      {/* Barra de guardado: solo con cambios pendientes, para no tapar campos en mobile */}
      {(dirty || submitting) && (
        <div className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 lg:bottom-6 lg:left-auto lg:right-8">
          <div className="flex items-center gap-3 rounded-2xl bg-surface p-2 pl-4 shadow-lift ring-1 ring-line/70">
            <span className="text-[13px] font-medium text-muted" role="status">
              {submitting ? "Guardando…" : "Cambios sin guardar"}
            </span>
            <button
              type="button"
              disabled={submitting}
              onClick={discard}
              className="pressable h-11 rounded-xl px-3 text-[14px] font-semibold disabled:opacity-40"
            >
              Descartar
            </button>
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="pressable inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-fg shadow-brand disabled:opacity-70"
            >
              {submitting && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
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
