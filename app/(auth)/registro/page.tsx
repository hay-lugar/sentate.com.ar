import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { getCurrentUser } from "@/lib/data/live/queries";

export const metadata: Metadata = { title: "Crear cuenta", robots: { index: false } };

export default async function RegistroPage() {
  if (await getCurrentUser()) redirect("/registro/local");
  return (
    <>
      <h1 className="mb-6 type-heading">Crear cuenta</h1>
      <SignupForm />
    </>
  );
}
