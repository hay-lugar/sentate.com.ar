import type { Metadata } from "next";
import { RecoverForm } from "@/components/auth/recover-form";
import { RECOVERY_LINK_ERROR } from "@/lib/auth/recovery";

export const metadata: Metadata = { title: "Recuperar contraseña", robots: { index: false } };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function RecoverPage({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold">Recuperá tu contraseña</h1>
      <p className="mt-1 mb-6 text-[14px] text-muted">Ingresá el email de tu cuenta y te mandamos el enlace.</p>
      <RecoverForm initialError={error === "enlace" ? RECOVERY_LINK_ERROR : undefined} />
    </>
  );
}
