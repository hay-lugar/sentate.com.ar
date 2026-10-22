import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { CreateLocalForm } from "@/components/auth/create-local-form";
import { leaveCreateLocalPath } from "@/lib/auth/destinations";
import { getCurrentUser, getMyTenantSlugs } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";

export const metadata: Metadata = { title: "Tu local", robots: { index: false } };

export default async function NuevoLocalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/registro/local");
  const result = await getMyTenantSlugs();
  if (result.status !== "ok") throw new TemporaryDataError("tus locales");
  const slugs = result.data;
  return (
    <>
      <h1 className="type-heading">{slugs.length ? "Sumar otro local" : "Tu local"}</h1>
      <p className="mt-1 mb-6 text-[0.9375rem] text-muted">Empieza sin publicar: cargás la carta y los horarios, y lo publicás cuando esté listo.</p>
      <CreateLocalForm />
      {/* Siempre hay salida: nadie queda obligado a crear un local. */}
      <nav aria-label="Otras opciones" className="mt-8 flex flex-col items-center gap-1 border-t border-line/70 pt-4 text-[0.9375rem]">
        <Link href={leaveCreateLocalPath(slugs[0] ?? null)} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
          {slugs.length ? "Volver a mi panel" : "Ahora no: ir a mi cuenta"}
        </Link>
        <Link href="/explorar" className="inline-flex min-h-11 items-center text-muted hover:text-foreground">
          Explorar locales
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="pressable inline-flex min-h-11 items-center text-muted hover:text-foreground">
            Cerrar sesión
          </button>
        </form>
      </nav>
    </>
  );
}
