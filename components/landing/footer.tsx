import Link from "next/link";
import { BRAND } from "@/lib/config/brand";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 type-help sm:px-6">
        <p className="mr-auto">© {BRAND.name}</p>
        <Link href="/login" className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-foreground">
          Ingresar
        </Link>
        <Link href="/el-bodegon" className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-foreground">
          Demo
        </Link>
      </div>
    </footer>
  );
}
