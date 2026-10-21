"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const ITEMS = [
  { href: "/cuenta", label: "Perfil" },
  { href: "/cuenta/reservas", label: "Reservas" },
  { href: "/cuenta/favoritos", label: "Favoritos" },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Mi cuenta" className="flex gap-1 border-b border-line">
      {ITEMS.map((i) => {
        const active = i.href === "/cuenta" ? pathname === "/cuenta" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn("inline-flex min-h-11 items-center border-b-2 px-3 text-[15px]", active ? "border-foreground font-medium" : "border-transparent text-muted hover:text-foreground")}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
