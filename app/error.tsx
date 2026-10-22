"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonClass, Button } from "@/components/ui/button";
import { redact } from "@/lib/log/redact";

// Última red de seguridad: cualquier error no previsto deja reintentar o volver al inicio (nunca una pantalla vacía).
export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[sentate] error de pantalla", redact(error.message), error.digest ?? "");
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10 text-center">
      <h1 className="type-heading">Algo salió mal</h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">No pudimos mostrar esta pantalla. Tus datos no se perdieron. Probá de nuevo o volvé al inicio.</p>
      <div className="mt-6 flex flex-col gap-2">
        <Button size="lg" onClick={reset}>
          Reintentar
        </Button>
        <Link href="/" className={buttonClass({ variant: "secondary", size: "lg" })}>
          Ir al inicio
        </Link>
        <Link href="/explorar" className={buttonClass({ variant: "quiet", size: "lg" })}>
          Explorar locales
        </Link>
      </div>
    </main>
  );
}
