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
        <h1 className="text-2xl font-bold">No pudimos validar el enlace</h1>
        <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-3 text-[13px] leading-snug text-rose-800">
          {RECOVERY_LINK_ERROR}
        </p>
        <p className="mt-6 text-center text-[14px] text-muted">
          <Link href="/recuperar" className="font-semibold text-brand underline-offset-4 hover:underline">
            Pedir un enlace nuevo
          </Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-bold">Elegí una contraseña nueva</h1>
      <p className="mt-1 mb-6 text-[14px] text-muted">Después de guardarla, entrás directo a tu panel.</p>
      <NewPasswordForm />
    </>
  );
}
