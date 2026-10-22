import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { parseIntent, postSignupPath } from "@/lib/auth/destinations";
import { getCurrentUser } from "@/lib/data/live/queries";

export const metadata: Metadata = { title: "Crear cuenta", robots: { index: false } };

export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ intencion?: string }> }) {
  const intent = parseIntent((await searchParams).intencion);
  // Con sesión iniciada no hay nada que registrar: «local» sigue al alta; el resto, a su cuenta.
  if (await getCurrentUser()) redirect(postSignupPath(intent));
  return (
    <>
      <h1 className="mb-6 type-heading">Crear cuenta</h1>
      <SignupForm intent={intent} />
    </>
  );
}
