import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { BRAND } from "@/lib/config/brand";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm place-items-center px-6">
      <div className="text-center">
        <Logo size="lg" className="mx-auto" />
        <h1 className="mt-10 type-heading">No encontramos esta página</h1>
        <p className="mt-2 text-[15px] text-muted">El local que buscás no está en {BRAND.name}, o todavía no publicó su carta.</p>
        <Link href="/" className={buttonClass({ className: "mt-8" })}>
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
