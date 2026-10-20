import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function Footer() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center">
      <Logo />
      <p className="text-[13px] text-muted">Hecho en Buenos Aires para la gastronomía argentina.</p>
      <nav className="flex gap-5 text-[13px] font-medium text-muted sm:ml-auto">
        <Link href="/el-bodegon" className="hover:text-foreground">Demo</Link>
        <Link href="/admin/el-bodegon" className="hover:text-foreground">Panel</Link>
        <Link href="#como-funciona" className="hover:text-foreground">Cómo funciona</Link>
      </nav>
    </footer>
  );
}
