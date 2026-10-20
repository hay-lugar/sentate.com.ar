"use client";

import { redact } from "@/lib/log/redact";
import { RefreshCw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

/**
 * Falla temporal al cargar datos: nunca se muestra como "no existe" ni como lista vacía.
 * "Reintentar" vuelve a pedir los datos al servidor (router.refresh) y re-renderiza el segmento.
 */
export function DataError({ error, reset, title = "No pudimos cargar esto" }: { error: Error & { digest?: string }; reset: () => void; title?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    // Solo nombre, mensaje depurado y digest: el objeto completo puede citar datos de la fila que falló.
    console.error("[sentate] error de página", error.name, redact(error.message), error.digest);
  }, [error]);

  return (
    <main className="grid min-h-[60dvh] place-items-center px-6 py-16">
      <div role="alert" className="max-w-sm text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-900">
          <WifiOff className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-bold">{title}</h1>
        <p className="mt-2 text-[15px] text-muted">
          Puede ser un problema de conexión o una falla temporal. Tus datos no se perdieron.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(() => {
              router.refresh();
              reset();
            })
          }
          className="pressable mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-ink px-5 font-semibold text-white shadow-lift disabled:opacity-60"
        >
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden /> {pending ? "Reintentando…" : "Reintentar"}
        </button>
        {error.digest && <p className="mt-4 text-[11px] text-muted">Código: {error.digest}</p>}
      </div>
    </main>
  );
}
