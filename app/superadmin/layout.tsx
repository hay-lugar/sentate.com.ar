import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { BRAND } from "@/lib/config/brand";
import { signOutAction } from "@/app/(auth)/actions";
import { getCurrentUser, supabaseServer } from "@/lib/data/live/queries";

const NAV = [
  { href: "/superadmin", label: "Bandeja" },
  { href: "/superadmin/resumen", label: "Resumen" },
  { href: "/superadmin/comercios", label: "Comercios" },
  { href: "/superadmin/suscripciones", label: "Suscripciones" },
  { href: "/superadmin/usuarios", label: "Usuarios" },
  { href: "/superadmin/administradores", label: "Administradores" },
  { href: "/superadmin/auditoria", label: "Auditoría" },
  { href: "/superadmin/sistema", label: "Sistema" },
];

export const metadata: Metadata = { title: "Superadmin", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Módulo separado y protegido. Este layout solo decide qué mostrar: el permiso REAL se valida en la base en cada
 * operación (public.admin_* → private.is_platform_admin), así que saltear la interfaz no da acceso a nada.
 */
export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/superadmin");
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("am_i_platform_admin");
  if (data !== true) notFound();
  return (
    <>
      <header className="border-b border-line bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label={`${BRAND.name}, inicio`} className="inline-flex min-h-11 items-center">
            <Logo size="sm" />
          </Link>
          <span className="rounded-md border border-line-strong px-2 py-1 text-[13px] font-medium">Superadmin</span>
          <span className="ml-auto hidden text-[13px] text-muted sm:inline">{user.email}</span>
          <Link href="/cuenta" className="inline-flex min-h-11 items-center px-2 text-[15px] text-muted hover:text-foreground">
            Mi cuenta
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="pressable inline-flex min-h-11 items-center rounded-xl border border-line-strong px-3 text-[15px] hover:bg-subtle">
              Cerrar sesión
            </button>
          </form>
        </div>
        <nav aria-label="Superadmin" className="no-scrollbar mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 sm:px-4">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-[15px] text-muted hover:bg-subtle hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">{children}</main>
    </>
  );
}
