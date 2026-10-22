import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/button";
import { BRAND } from "@/lib/config/brand";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background">
      <nav aria-label="Principal" className="mx-auto flex h-16 max-w-5xl items-center gap-1 px-2 min-[360px]:px-3 sm:gap-2 sm:px-6">
        <Link href="/" aria-label={`${BRAND.name}, inicio`} className="mr-auto inline-flex min-h-11 items-center">
          <Logo size="md" />
        </Link>
        <Link href="/explorar" className="inline-flex h-11 items-center rounded-xl px-2 text-[15px] text-muted hover:text-foreground sm:px-3">
          Explorar
        </Link>
        <Link href="#negocios" className="hidden h-11 items-center rounded-xl px-3 text-[15px] text-muted hover:text-foreground sm:inline-flex">
          Para negocios
        </Link>
        <Link href="#precio" className="hidden h-11 items-center rounded-xl px-3 text-[15px] text-muted hover:text-foreground sm:inline-flex">
          Precio
        </Link>
        <Link href="/login" className={buttonClass({ variant: "quiet", size: "sm", className: "px-2 sm:px-3.5" })}>
          Ingresar
        </Link>
        <Link href="/registro" className={buttonClass({ size: "sm", className: "px-2.5 sm:px-3.5" })}>
          Crear cuenta
        </Link>
      </nav>
    </header>
  );
}
