import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { AccountNav } from "@/components/account/account-nav";
import { Logo } from "@/components/ui/logo";
import { BRAND } from "@/lib/config/brand";
import { getCurrentUser } from "@/lib/data/live/queries";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/cuenta");
  return (
    <>
      <header className="border-b border-line bg-background">
        <nav aria-label="Principal" className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" aria-label={`${BRAND.name}, inicio`} className="mr-auto inline-flex min-h-11 items-center">
            <Logo size="md" />
          </Link>
          <Link href="/explorar" className="inline-flex min-h-11 items-center rounded-xl px-3 text-[15px] text-muted hover:text-foreground">
            Explorar
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="pressable inline-flex min-h-11 items-center rounded-xl px-3 text-[15px] text-muted hover:text-foreground">
              Cerrar sesión
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 type-title">Mi cuenta</h1>
        <AccountNav />
        <div className="mt-6">{children}</div>
      </main>
    </>
  );
}
