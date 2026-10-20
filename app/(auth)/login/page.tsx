import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/data/live/queries";
import { safeNext } from "@/lib/auth/redirects";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next) ?? "/admin");
  return (
    <>
      <h1 className="text-2xl font-bold">Ingresá a tu panel</h1>
      <p className="mt-1 mb-6 text-[14px] text-muted">Gestioná tu carta y las solicitudes de mesa.</p>
      <LoginForm
        next={safeNext(next) ?? undefined}
        initialError={error === "confirmacion" ? "El enlace de confirmación no es válido o venció. Ingresá o pedí uno nuevo." : undefined}
      />
    </>
  );
}
