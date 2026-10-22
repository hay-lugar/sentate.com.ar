import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/button";
import { BRAND } from "@/lib/config/brand";
import { getCurrentUser, getMyTenantSlugs } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";

export const metadata: Metadata = { title: "Mi panel", robots: { index: false } };

/**
 * /admin: lleva al primer local de la persona. Si no administra ninguno NO la manda a crear uno: le explica y le deja elegir
 * (crear un local, ir a su cuenta, explorar o cerrar sesión). Así un comensal nunca queda atrapado en el alta.
 */
export default async function AdminIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  const slugs = await getMyTenantSlugs();
  if (slugs.status !== "ok") throw new TemporaryDataError("tus locales");
  if (slugs.data[0]) redirect(`/admin/${slugs.data[0]}`);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-5 py-10 sm:justify-center sm:py-16">
      <Link href="/" aria-label={`${BRAND.name}, inicio`} className="mb-10 self-center">
        <Logo size="lg" />
      </Link>
      <h1 className="type-heading">Todavía no tenés un local</h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
        Tu cuenta ({user.email}) no administra ningún local. Si querés publicar tu carta y recibir reservas, creá uno; si solo querés descubrir
        locales, seguí desde tu cuenta.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <Link href="/registro/local" className={buttonClass({ size: "lg", className: "w-full" })}>
          Crear mi local
        </Link>
        <Link href="/cuenta" className={buttonClass({ variant: "secondary", size: "lg", className: "w-full" })}>
          Ir a mi cuenta
        </Link>
        <Link href="/explorar" className={buttonClass({ variant: "quiet", size: "lg", className: "w-full" })}>
          Explorar locales
        </Link>
      </div>
      <form action={signOutAction} className="mt-4 self-center">
        <button type="submit" className="pressable inline-flex min-h-11 items-center text-[0.9375rem] text-muted hover:text-foreground">
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
