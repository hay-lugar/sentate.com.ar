"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/format";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <nav
        className={cn(
          "mx-auto flex h-16 max-w-6xl items-center gap-6 rounded-[1.4rem] px-3 pl-4 transition-all duration-500",
          scrolled ? "bg-surface/80 shadow-soft ring-1 ring-line/70 backdrop-blur-xl" : "bg-transparent",
        )}
      >
        <Link href="/" aria-label="Sentate, inicio">
          <Logo />
        </Link>
        <div className="hidden items-center gap-1 text-[14px] font-medium text-muted md:flex">
          {[
            ["Cómo funciona", "#como-funciona"],
            ["Precio", "#precio"],
            ["Demo", "/el-bodegon"],
            ["Panel demo", "/admin/el-bodegon"],
          ].map(([label, href]) => (
            <Link key={href} href={href} className="rounded-full px-3.5 py-2 transition-colors hover:bg-ink/5 hover:text-foreground">
              {label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className="pressable inline-flex h-11 items-center rounded-2xl px-4 text-[14px] font-semibold text-muted hover:bg-ink/5 hover:text-foreground"
          >
            Ingresar
          </Link>
          <Link
            href="/registro"
            className="pressable inline-flex h-11 items-center gap-1.5 rounded-2xl bg-ink px-4 text-[14px] font-semibold text-white shadow-lift hover:bg-ink/90"
          >
            Probar gratis <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>
      </nav>
    </header>
  );
}
