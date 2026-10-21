"use client";

import { redact } from "@/lib/log/redact";
import { Button } from "@/components/ui/button";
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
        <h1 className="type-heading">{title}</h1>
        <p className="mt-2 text-[15px] text-muted">
          Puede ser un problema de conexión o una falla temporal. Tus datos no se perdieron.
        </p>
        <Button
          pending={pending}
          onClick={() =>
            start(() => {
              router.refresh();
              reset();
            })
          }
          className="mt-6"
        >
          {pending ? "Reintentando…" : "Reintentar"}
        </Button>
        {error.digest && <p className="mt-4 type-help">Código: {error.digest}</p>}
      </div>
    </main>
  );
}
