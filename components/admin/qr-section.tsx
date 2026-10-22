"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { QR_PRINT_MIN_CM } from "@/lib/qr/config";
import { qrPngDataUrl, qrSvg, svgDataUrl } from "@/lib/qr/generate";
import { displayUrl, isPilotOrigin, publicMenuUrl, qrFileName } from "@/lib/qr/url";
import { useDemo } from "./demo-provider";

const SCAN_TEXT = "Escaneá para ver la carta y solicitar una mesa";

function save(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * QR de la carta pública del comercio. El origen sale de APP_URL (servidor), nunca del navegador: el QR no puede
 * apuntar a localhost por accidente. Con un origen que no es del piloto el QR se genera igual, pero los archivos se
 * llaman `-prueba` y se bloquea la impresión.
 */
export function QrSection({ origin }: { origin: string | null }) {
  const { state, mode, live } = useDemo();
  const slug = state.slug;
  const name = state.profile.name;
  const published = mode === "demo" ? true : !!live?.isPublished;

  const url = origin ? publicMenuUrl(origin, slug) : null;
  const pilot = origin ? isPilotOrigin(origin) : false;

  const [generated, setGenerated] = useState<{ url: string; svg: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const linkInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void qrSvg(url).then((svg) => {
      if (!cancelled) setGenerated({ url, svg });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const say = (message: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  };

  if (!origin || !url) {
    return (
      <p role="alert" className="rounded-xl border border-warning/50 bg-subtle p-4 text-[0.9375rem] leading-snug">
        No se puede generar el QR: falta configurar <code className="font-semibold">APP_URL</code>, la dirección pública de la app (por ejemplo
        https://sentate.com.ar). Sin ella no hay forma segura de armar un enlace que funcione fuera de este equipo.
      </p>
    );
  }

  const svg = generated?.url === url ? generated.svg : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      say("Enlace copiado.");
    } catch {
      linkInput.current?.select();
      say("No pudimos copiarlo solo. Quedó seleccionado: copialo con Ctrl+C, o mantené apretado en el celular.");
    }
  };

  const downloadSvg = () => {
    if (!svg) return;
    const filename = qrFileName(slug, "svg", pilot);
    save(new Blob([svg], { type: "image/svg+xml" }), filename);
    say(`Descargamos ${filename}.`);
  };

  const downloadPng = async () => {
    setBusy(true);
    try {
      const blob = await (await fetch(await qrPngDataUrl(url))).blob();
      const filename = qrFileName(slug, "png", pilot);
      save(blob, filename);
      say(`Descargamos ${filename}.`);
    } catch {
      say("No pudimos generar el PNG. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const notice_ = "rounded-xl border border-warning/50 bg-subtle p-4 text-[0.9375rem] leading-snug";

  return (
    <>
      <div className="max-w-3xl space-y-10 pb-24 print:hidden">
        {(!published || !pilot || mode === "demo") && (
          <div className="space-y-3">
            {!published && (
              <p role="status" className={notice_}>
                Tu carta todavía no está publicada: quien escanee este QR va a ver «no encontrado» hasta que la publiques.{" "}
                <Link href={`/admin/${slug}`} className="font-medium underline underline-offset-2">
                  Ir a Inicio para publicarla
                </Link>
                .
              </p>
            )}
            {!pilot && (
              <p role="status" className={notice_}>
                Este QR apunta a <strong className="font-semibold">{origin}</strong>, un entorno de prueba. No lo imprimas ni lo pegues en tu local: en
                producción el enlace usa tu dirección pública con https. Los archivos descargados llevan «-prueba» en el nombre.
              </p>
            )}
            {mode === "demo" && <p className="type-help">Demo: este QR abre la carta de ejemplo.</p>}
          </div>
        )}

        <section aria-labelledby="qr-enlace">
          <h2 id="qr-enlace" className="type-section">
            Enlace de tu carta
          </h2>
          <p className="mt-1 mb-4 text-[0.9375rem] text-muted">Es la dirección que abre el QR. Compartila también por WhatsApp o redes.</p>
          <label htmlFor="public-link" className="sr-only">
            Enlace público de tu carta
          </label>
          <input
            id="public-link"
            ref={linkInput}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-12 w-full rounded-xl bg-surface px-4 text-[1rem] text-foreground ring-1 ring-field outline-none focus:ring-2 focus:ring-foreground"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copy}>
              Copiar enlace
            </Button>
            <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary" })}>
              Abrir mi carta
            </a>
          </div>
        </section>

        <section aria-labelledby="qr-codigo">
          <h2 id="qr-codigo" className="type-section">
            Código QR
          </h2>
          <div className="mt-4 grid aspect-square w-full max-w-[17rem] place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-line-strong">
            {svg ? (
              // eslint-disable-next-line @next/next/no-img-element -- SVG generado en el navegador (data URL), no hay nada que optimizar
              <img src={svgDataUrl(svg)} alt={`Código QR que abre ${displayUrl(url)}`} className="size-full" />
            ) : (
              <span className="type-help" role="status">
                Generando el código…
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={downloadSvg} disabled={!svg}>
              Descargar SVG
            </Button>
            <Button variant="secondary" onClick={downloadPng} disabled={!svg} pending={busy}>
              Descargar PNG
            </Button>
          </div>
          <p className="mt-3 type-help">
            SVG para imprenta: no pierde nitidez a ningún tamaño. PNG de 1200 px (10 cm a 300 dpi) para Word, redes o impresión casera.
          </p>
        </section>

        <section aria-labelledby="qr-imprimir">
          <h2 id="qr-imprimir" className="type-section">
            Calcomanía para imprimir
          </h2>
          <p className="mt-1 mb-4 text-[0.9375rem] text-muted">
            Una hoja A4 con el nombre de tu local, el QR de 11 cm y el texto «{SCAN_TEXT}».
          </p>
          <Button onClick={() => window.print()} disabled={!pilot} aria-describedby={pilot ? undefined : "print-blocked"}>
            Imprimir calcomanía
          </Button>
          {!pilot && (
            <p id="print-blocked" className="mt-2 type-help">
              Imprimir está bloqueado mientras el enlace apunte a un entorno de prueba.
            </p>
          )}
          <ul className="mt-4 list-disc space-y-1.5 pl-5 type-help">
            <li>Imprimila al 100 %, sin «ajustar a la página». El QR no debe bajar de {QR_PRINT_MIN_CM} cm de lado.</li>
            <li>Usá papel claro y mate. Evitá el brillo y los reflejos frente al QR.</li>
            <li>Dejá el margen blanco alrededor: sin él algunos teléfonos no lo leen.</li>
            <li>Probalo con tu celular antes de pegarlo.</li>
          </ul>
        </section>

        <p role="status" aria-live="polite" className={cn("min-h-5 type-label text-success", !notice && "sr-only")}>
          {notice}
        </p>
      </div>

      {/* Calcomanía: solo se ve al imprimir. Negro sobre blanco; el QR no lleva logo encima. */}
      <section aria-hidden className="hidden flex-col items-center gap-[1.2cm] bg-white text-center text-black print:flex">
        <p className="font-display text-[40pt] leading-tight font-bold break-words">{name}</p>
        {/* Cuadrado SIEMPRE: si el ancho disponible es menor a 11 cm se achica parejo (aspect-ratio), nunca se deforma. */}
        {svg && (
          // eslint-disable-next-line @next/next/no-img-element -- SVG en data URL, solo para impresión
          <img src={svgDataUrl(svg)} alt="" style={{ width: "11cm", maxWidth: "100%", height: "auto", aspectRatio: "1 / 1" }} />
        )}
        <p className="max-w-[16cm] text-[26pt] leading-snug font-semibold">{SCAN_TEXT}</p>
        <p className="text-[16pt]">{displayUrl(url)}</p>
      </section>
    </>
  );
}
