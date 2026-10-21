import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background">
      <nav aria-label="Principal" className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" aria-label="Sentate, inicio" className="mr-auto">
          <Logo size="md" />
        </Link>
        <Link href="#precio" className="hidden h-11 items-center rounded-xl px-3 text-[15px] text-muted hover:text-foreground sm:inline-flex">
          Precio
        </Link>
        <Link href="/login" className={buttonClass({ variant: "quiet", size: "sm" })}>
          Ingresar
        </Link>
        <Link href="/registro" className={buttonClass({ size: "sm" })}>
          Crear cuenta
        </Link>
      </nav>
    </header>
  );
}
