import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/data/live/queries";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { fetchEnabledProviders } from "@/lib/auth/providers";
import { safeNext } from "@/lib/auth/redirects";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next) ?? "/admin");
  const providers = await fetchEnabledProviders();
  return (
    <>
      <h1 className="mb-6 type-heading">Ingresar</h1>
      <LoginForm
        next={safeNext(next) ?? undefined}
        initialError={
          error === "confirmacion"
            ? "El enlace de confirmación no es válido o venció. Ingresá o pedí uno nuevo."
            : error === "proveedor"
              ? "No pudimos ingresar con ese servicio. Probá de nuevo o usá tu email."
              : undefined
        }
      />
      <OAuthButtons providers={providers} next={safeNext(next) ?? undefined} />
    </>
  );
}
