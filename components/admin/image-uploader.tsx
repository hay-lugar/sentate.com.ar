"use client";

import { ImageOff, ImagePlus, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { sweepOrphanImagesAction } from "@/app/admin/[slug]/actions";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { ACCEPT_ATTR, KIND_SPECS, type ImageKind } from "@/lib/images/config";
import { buildImagePath } from "@/lib/images/paths";
import { ImageError, prepareImage } from "@/lib/images/prepare";
import { uploadImage } from "@/lib/images/upload";
import { useStorageUrl } from "@/lib/images/use-storage-url";
import { limitsHint } from "@/lib/images/validate";

type Phase = "idle" | "processing" | "uploading" | "saving";
export type ImageChangeResult = { ok: true } | { ok: false; message: string };

type Props = {
  tenantId: string;
  kind: ImageKind;
  /** Ruta de Storage o URL https que está guardada ahora. */
  value?: string | null;
  /**
   * Recibe la ruta ya subida (o null al quitar la imagen). Si devuelve un resultado, el campo muestra el error
   * cuando el guardado falla. La imagen anterior no se toca: sigue referenciada hasta que el guardado nuevo se confirma.
   */
  onChange: (path: string | null) => void | Promise<ImageChangeResult | void>;
  disabled?: boolean;
  shape?: "square" | "wide";
};

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  processing: "Optimizando la imagen…",
  uploading: "Subiendo",
  saving: "Guardando…",
};

export function ImageUploader({ tenantId, kind, value, onChange, disabled, shape = "square" }: Props) {
  const uid = useId();
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const spec = KIND_SPECS[kind];

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  /**
   * Lo recién guardado (o quitado), visible hasta que `value` lo confirme: evita ver la imagen vieja un instante y
   * volver a firmar la URL. `from` es el valor previo: mientras `value` siga siendo ese o ya sea el nuevo, manda esto.
   */
  const [local, setLocal] = useState<{ path: string | null; url: string | null; from: string | null } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastFile = useRef<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const stored = useStorageUrl(value);
  const current = value ?? null;
  const shown = local && (current === local.path || current === local.from) ? (local.url ?? undefined) : stored;
  const busy = phase !== "idle";

  // Libera la URL local al reemplazarla o desmontar, y cancela una subida en curso.
  useEffect(() => {
    const url = local?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [local]);
  useEffect(() => () => controller.current?.abort(), []);

  const start = async (file: File) => {
    controller.current?.abort();
    const run = new AbortController();
    controller.current = run;
    lastFile.current = file;
    setError(null);
    setProgress(0);
    setPhase("processing");

    try {
      const prepared = await prepareImage(file, kind);
      if (run.signal.aborted) return;
      const path = buildImagePath(tenantId, kind, prepared.ext);
      const previewUrl = URL.createObjectURL(prepared.blob);

      setPhase("uploading");
      await uploadImage(path, prepared, { signal: run.signal, onProgress: setProgress });

      setPhase("saving");
      const result = await onChange(path);
      if (result && !result.ok) {
        URL.revokeObjectURL(previewUrl);
        setError({ message: result.message, retryable: false });
        return;
      }
      setLocal({ path, url: previewUrl, from: current });
      // Limpieza best-effort de imágenes que ya no usa nadie. Nunca toca las referenciadas ni las de la última hora.
      void sweepOrphanImagesAction(tenantId).catch(() => undefined);
    } catch (e) {
      if (run.signal.aborted) return;
      const known = e instanceof ImageError;
      setError({ message: known ? e.message : "No pudimos subir la imagen. Probá de nuevo.", retryable: known && /conexión|tardó/.test(e.message) });
    } finally {
      if (controller.current === run) setPhase("idle");
    }
  };

  const onPick = (file: File | undefined) => {
    if (input.current) input.current.value = ""; // permite elegir de nuevo el mismo archivo
    if (file) void start(file);
  };

  const remove = async () => {
    setError(null);
    setPhase("saving");
    try {
      const result = await onChange(null);
      if (result && !result.ok) setError({ message: result.message, retryable: false });
      else {
        setLocal({ path: null, url: null, from: current });
        void sweepOrphanImagesAction(tenantId).catch(() => undefined);
      }
    } finally {
      setPhase("idle");
    }
  };

  const label = `${shown ? "Reemplazar" : "Subir"} ${spec.label.toLowerCase()}`;

  return (
    <div className="space-y-3">
      <div className={cn("flex gap-4", shape === "wide" ? "flex-col" : "items-center")}>
        <div
          className={cn(
            "relative grid shrink-0 place-items-center overflow-hidden bg-subtle text-muted ring-1 ring-line",
            shape === "wide" ? "aspect-[16/7] w-full rounded-xl" : "size-24 rounded-xl",
          )}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob) o URL firmada del bucket privado
            <img src={shown} alt={`${spec.label}: vista previa`} className="size-full object-cover" />
          ) : (
            <ImageOff className="size-6" aria-hidden />
          )}
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-surface/70">
              <LoaderCircle className="size-6 animate-spin" aria-hidden />
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap gap-2">
          <label
            className={cn(
              buttonClass({ variant: "secondary" }),
              "cursor-pointer focus-within:outline-2 focus-within:outline-offset-2",
              (busy || disabled) && "pointer-events-none opacity-60",
            )}
          >
            <ImagePlus className="size-4" aria-hidden />
            {label}
            <input
              ref={input}
              type="file"
              accept={ACCEPT_ATTR}
              className="sr-only"
              disabled={busy || disabled}
              aria-describedby={error ? `${hintId} ${errorId}` : hintId}
              onChange={(e) => onPick(e.target.files?.[0])}
            />
          </label>
          {shown && !busy && (
            <Button variant="danger" onClick={remove} disabled={disabled}>
              Quitar
            </Button>
          )}
        </div>
      </div>

      {busy && (
        <div aria-live="polite">
          <div
            role="progressbar"
            aria-label={`Subiendo ${spec.label.toLowerCase()}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={phase === "uploading" ? progress : undefined}
            className="h-1.5 overflow-hidden rounded-full bg-line"
          >
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: phase === "uploading" ? `${progress}%` : phase === "saving" ? "100%" : "8%" }} />
          </div>
          <p className="mt-1.5 text-[13px] text-muted">{phase === "uploading" ? `${PHASE_LABEL.uploading} ${progress}%…` : PHASE_LABEL[phase as Exclude<Phase, "idle">]}</p>
        </div>
      )}

      {error && (
        <p id={errorId} role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-danger/40 bg-danger/5 p-3 text-[14px] leading-snug text-danger">
          <span>{error.message}</span>
          {error.retryable && (
            <button type="button" onClick={() => lastFile.current && void start(lastFile.current)} className="font-medium underline underline-offset-2">
              Reintentar
            </button>
          )}
        </p>
      )}

      <p id={hintId} className="text-[13px] text-muted">
        {limitsHint(kind)}
      </p>
    </div>
  );
}
