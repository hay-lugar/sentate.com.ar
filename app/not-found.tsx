import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <Logo className="mx-auto mb-10" />
        <p className="font-display text-7xl font-bold text-brand">404</p>
        <h1 className="mt-3 text-2xl font-bold">Esta mesa no existe</h1>
        <p className="mt-2 text-muted">El local que buscás no está en Sentate (todavía).</p>
        <Link
          href="/"
          className="pressable mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 font-semibold text-white shadow-lift"
        >
          <ArrowLeft className="size-4" /> Volver al inicio
        </Link>
      </div>
    </main>
  );
}
