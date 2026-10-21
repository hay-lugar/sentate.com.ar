import type { Metadata } from "next";
import { RecoverForm } from "@/components/auth/recover-form";
import { RECOVERY_LINK_ERROR } from "@/lib/auth/recovery";

export const metadata: Metadata = { title: "Recuperar contraseña", robots: { index: false } };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function RecoverPage({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <>
      <h1 className="mb-6 type-heading">Recuperar contraseña</h1>
      <RecoverForm initialError={error === "enlace" ? RECOVERY_LINK_ERROR : undefined} />
    </>
  );
}
