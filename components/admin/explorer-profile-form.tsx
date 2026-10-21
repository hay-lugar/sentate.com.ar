"use client";

import dynamic from "next/dynamic";
import { CheckCircle2, LoaderCircle, Search } from "lucide-react";
import { useId, useState } from "react";
import { saveExplorerProfileAction, submitForReviewAction } from "@/app/admin/[slug]/explorador/actions";
import { FieldError, inputClass } from "@/components/menu/reservation/controls";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { AR_CENTER, explorerProfileSchema, inArgentina, MISSING_LABELS, MODERATION_COPY, type ExplorerProfileInput, type ModerationStatus } from "@/lib/explorer/profile";

const LocationPicker = dynamic(() => import("./location-picker"), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-subtle sm:h-96" aria-hidden />,
});

type Option = { code: string; label: string };
type Geo = { label: string; lat: number; lng: number; locality: string; neighborhood: string };

type Props = {
  tenantId: string;
  initial: ExplorerProfileInput & { hasLocation: boolean };
  businessTypes: Option[];
  cuisines: Option[];
  provinces: Option[];
  moderation: { status: ModerationStatus; reason: string; suspensionReason: string };
  missing: string[];
  geocodingEnabled: boolean;
  isPublished: boolean;
};

export function ExplorerProfileForm({ tenantId, initial, businessTypes, cuisines, provinces, moderation, missing: initialMissing, geocodingEnabled, isPublished }: Props) {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [missing, setMissing] = useState(initialMissing);
  const [status, setStatus] = useState(moderation.status);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Geo[] | null>(null);
  const [searching, setSearching] = useState(false);

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const pinned = draft.hasLocation;
  const suspended = !!moderation.suspensionReason;

  const setPin = (lat: number, lng: number) => setDraft((d) => ({ ...d, lat, lng, hasLocation: true, confirm: false }));

  const toggleCuisine = (code: string) =>
    set("cuisines", draft.cuisines.includes(code) ? draft.cuisines.filter((c) => c !== code) : draft.cuisines.length >= 3 ? draft.cuisines : [...draft.cuisines, code]);

  const search = async () => {
    if (query.trim().length < 4 || searching) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const body = (await res.json()) as { results?: Geo[] };
      setResults(res.ok ? (body.results ?? []) : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const pickResult = (r: Geo) => {
    setDraft((d) => ({
      ...d,
      lat: r.lat,
      lng: r.lng,
      hasLocation: true,
      confirm: false,
      address: d.address || r.label.split(",")[0] || d.address,
      locality: d.locality || r.locality,
      neighborhood: d.neighborhood || r.neighborhood,
    }));
    setResults(null);
  };

  const save = async (confirm: boolean) => {
    const input = { ...draft, confirm, lat: Number(draft.lat), lng: Number(draft.lng) };
    const parsed = explorerProfileSchema.safeParse(input);
    if (!parsed.success || !pinned) {
      const fe: Record<string, string> = {};
      if (!parsed.success) for (const issue of parsed.error.issues) fe[String(issue.path[0])] ??= issue.message;
      if (!pinned) fe.location = "Marcá la ubicación en el mapa.";
      setErrors(fe);
      setMessage({ tone: "error", text: "Revisá los campos marcados." });
      return false;
    }
    setErrors({});
    setBusy("save");
    const res = await saveExplorerProfileAction(tenantId, parsed.data);
    setBusy(null);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      setMessage({ tone: "error", text: res.message });
      return false;
    }
    setMissing(res.missing);
    const next = { ...draft, confirm, hasLocation: true };
    setDraft(next);
    setSaved(next);
    setMessage({ tone: "ok", text: confirm ? "Ubicación confirmada y perfil guardado." : "Perfil guardado." });
    return true;
  };

  const submitReview = async () => {
    if (dirty && !(await save(draft.confirm))) return;
    setBusy("submit");
    const res = await submitForReviewAction(tenantId);
    setBusy(null);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.message });
      return;
    }
    setStatus("pending_review");
    setMessage({ tone: "ok", text: "Enviado a revisión." });
  };

  const canSubmit = (status === "draft" || status === "changes_requested" || status === "rejected") && missing.length === 0 && !dirty;
  const copy = MODERATION_COPY[status];

  return (
    <div className="max-w-3xl space-y-10 pb-24">
      <section aria-labelledby={id("status")} className="rounded-xl border border-line p-4">
        <h2 id={id("status")} className="type-label">
          Estado en el explorador: <span className="font-semibold">{copy.title}</span>
        </h2>
        <p className="mt-1 text-[15px] text-muted">{copy.body}</p>
        {moderation.reason && status !== "approved" && <p className="mt-2 text-[15px]">Motivo: {moderation.reason}</p>}
        {suspended && <p className="mt-2 text-[15px] text-danger">Tu comercio está suspendido: {moderation.suspensionReason}</p>}
        {!isPublished && <p className="mt-2 text-[15px] text-muted">Tu carta está sin publicar: no aparece en el explorador aunque esté aprobado.</p>}
        {missing.length > 0 && (status === "draft" || status === "changes_requested" || status === "rejected") && (
          <div className="mt-3">
            <p className="type-label">Para enviar a revisión falta:</p>
            <ul className="mt-1 list-disc pl-5 text-[15px]">
              {missing.map((k) => (
                <li key={k}>{MISSING_LABELS[k] ?? k}</li>
              ))}
            </ul>
          </div>
        )}
        {(status === "draft" || status === "changes_requested" || status === "rejected") && (
          <div className="mt-4">
            <Button onClick={submitReview} pending={busy === "submit"} disabled={!canSubmit && !dirty ? true : busy !== null}>
              Solicitar aprobación
            </Button>
            {dirty && <p className="mt-2 type-help">Se guardan los cambios antes de enviar.</p>}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-line pb-3 type-section">Tu comercio</h2>
        <div>
          <label htmlFor={id("bt")} className="mb-1.5 block type-label">Tipo de comercio</label>
          <select id={id("bt")} value={draft.businessType} onChange={(e) => set("businessType", e.target.value)} aria-invalid={!!errors.businessType} className={inputClass}>
            <option value="">Elegí uno</option>
            {businessTypes.map((b) => (
              <option key={b.code} value={b.code}>{b.label}</option>
            ))}
          </select>
          <FieldError id={id("bt-error")}>{errors.businessType}</FieldError>
        </div>
        <fieldset>
          <legend className="mb-1.5 type-label">Cocina <span className="text-[13px] font-normal text-muted">Hasta 3</span></legend>
          <div className="flex flex-wrap gap-2">
            {cuisines.map((c) => {
              const on = draft.cuisines.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCuisine(c.code)}
                  className={cn("pressable min-h-11 rounded-full border px-4 text-[15px]", on ? "border-foreground bg-foreground text-background" : "border-line-strong")}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <FieldError id={id("cu-error")}>{errors.cuisines}</FieldError>
        </fieldset>
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-line pb-3 type-section">Ubicación</h2>
        <Field id={id("address")} label="Dirección" value={draft.address} onChange={(v) => set("address", v)} error={errors.address} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={id("prov")} className="mb-1.5 block type-label">Provincia</label>
            <select id={id("prov")} value={draft.provinceCode} onChange={(e) => set("provinceCode", e.target.value)} aria-invalid={!!errors.provinceCode} className={inputClass}>
              <option value="">Elegí una</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
            </select>
            <FieldError id={id("prov-error")}>{errors.provinceCode}</FieldError>
          </div>
          <Field id={id("loc")} label="Localidad" value={draft.locality} onChange={(v) => set("locality", v)} error={errors.locality} />
        </div>
        <Field id={id("nb")} label="Barrio o zona" optional value={draft.neighborhood} onChange={(v) => set("neighborhood", v)} error={errors.neighborhood} />

        {geocodingEnabled && (
          <div>
            <label htmlFor={id("q")} className="mb-1.5 block type-label">Buscar la dirección en el mapa</label>
            <div className="flex gap-2">
              <input id={id("q")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void search())} placeholder="Calle, número y ciudad" className={inputClass} />
              <Button variant="secondary" onClick={search} disabled={searching || query.trim().length < 4} aria-label="Buscar dirección">
                {searching ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
              </Button>
            </div>
            {results && (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line" aria-label="Resultados">
                {results.length === 0 && <li className="p-3 text-[15px] text-muted">No encontramos esa dirección. Marcá el punto en el mapa.</li>}
                {results.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button type="button" onClick={() => pickResult(r)} className="min-h-11 w-full p-3 text-left text-[15px] hover:bg-subtle">{r.label}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <p className="mb-1.5 type-label">Pin del local</p>
          <p className="mb-2 type-help">Tocá el mapa o arrastrá el pin hasta la puerta de tu local. Usamos esta ubicación, no la de tu dispositivo.</p>
          <LocationPicker lat={pinned ? draft.lat : null} lng={pinned ? draft.lng : null} onChange={setPin} label="Mapa para ubicar el local" />
          <FieldError id={id("loc-error")}>{errors.location ?? errors.lat ?? errors.lng}</FieldError>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-3 text-[15px]">Ingresar coordenadas manualmente</summary>
            <div className="grid gap-3 sm:grid-cols-2">
              <CoordField id={id("lat")} label="Latitud" value={pinned ? draft.lat : ""} onChange={(v) => setCoord("lat", v)} />
              <CoordField id={id("lng")} label="Longitud" value={pinned ? draft.lng : ""} onChange={(v) => setCoord("lng", v)} />
            </div>
          </details>
        </div>
        {pinned && (
          <p className={cn("flex items-center gap-2 text-[15px]", draft.confirm ? "text-success" : "text-muted")}>
            {draft.confirm ? <CheckCircle2 className="size-4" aria-hidden /> : null}
            {draft.confirm ? "Ubicación confirmada." : "Ubicación sin confirmar: confirmala para aparecer en el explorador."}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-line pb-3 type-section">Enlaces</h2>
        <Field id={id("web")} label="Sitio web" optional type="url" value={draft.websiteUrl} onChange={(v) => set("websiteUrl", v)} error={errors.websiteUrl} placeholder="https://" />
        <Field id={id("ig")} label="Instagram" optional type="url" value={draft.instagramUrl} onChange={(v) => set("instagramUrl", v)} error={errors.instagramUrl} placeholder="https://instagram.com/tulocal" />
        <Field id={id("fb")} label="Facebook" optional type="url" value={draft.facebookUrl} onChange={(v) => set("facebookUrl", v)} error={errors.facebookUrl} placeholder="https://facebook.com/tulocal" />
        <p className="type-help">El teléfono del local se edita en Ajustes. No publicamos el teléfono de tu cuenta.</p>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button variant="secondary" onClick={() => save(false)} pending={busy === "save"} disabled={busy !== null || !dirty}>
          Guardar
        </Button>
        <Button onClick={() => save(true)} pending={busy === "save"} disabled={busy !== null || !pinned || (!dirty && draft.confirm)}>
          Guardar y confirmar ubicación
        </Button>
        {message && (
          <p role="status" className={cn("text-[15px]", message.tone === "ok" ? "text-success" : "text-danger")}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );

  function setCoord(key: "lat" | "lng", raw: string) {
    const n = Number(raw.replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(n)) return;
    const base = pinned ? { lat: draft.lat, lng: draft.lng } : { lat: AR_CENTER.lat, lng: AR_CENTER.lng };
    const next = { ...base, [key]: n };
    if (inArgentina(next.lat, next.lng)) setPin(next.lat, next.lng);
  }
}

function Field({ id, label, value, onChange, error, optional, type = "text", placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; optional?: boolean; type?: string; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex justify-between type-label">
        {label}
        {optional && <span className="text-[13px] font-normal text-muted">Opcional</span>}
      </label>
      <input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className={inputClass} />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

function CoordField({ id, label, value, onChange }: { id: string; label: string; value: number | ""; onChange: (v: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block type-label">{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={text ?? (value === "" ? "" : String(Number(value.toFixed(6))))}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={() => setText(null)}
        className={inputClass}
      />
    </div>
  );
}
