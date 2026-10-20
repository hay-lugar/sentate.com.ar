import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { getCurrentUser } from "@/lib/data/live/queries";
import { trialLongLabel } from "@/lib/config/plan";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegistroPage() {
  if (await getCurrentUser()) redirect("/registro/local");
  return (
    <>
      <h1 className="text-2xl font-bold">Probá Sentate</h1>
      <p className="mt-1 mb-6 text-[14px] text-muted">{trialLongLabel[0].toUpperCase() + trialLongLabel.slice(1)}. Primero creá tu cuenta.</p>
      <SignupForm />
    </>
  );
}
