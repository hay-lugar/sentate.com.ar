import type { Metadata } from "next";
import Link from "next/link";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { getCurrentUser } from "@/lib/data/live/queries";
import { RECOVERY_LINK_ERROR } from "@/lib/auth/recovery";

export const metadata: Metadata = { title: "Nueva contraseña", robots: { index: false } };

/** Solo accesible con la sesión que deja el enlace de recuperación ya canjeado (ver /auth/callback). */
export default async function NewPasswordPage() {
  if (!(await getCurrentUser())) {
    return (
      <>
        <h1 className="type-heading">No pudimos validar el enlace</h1>
        <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger/5 p-3 text-[14px] leading-snug text-danger">
          {RECOVERY_LINK_ERROR}
        </p>
        <p className="mt-6 text-center type-help">
          <Link href="/recuperar" className="font-medium text-foreground underline underline-offset-4">
            Pedir un enlace nuevo
          </Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-6 type-heading">Contraseña nueva</h1>
      <NewPasswordForm />
    </>
  );
}
