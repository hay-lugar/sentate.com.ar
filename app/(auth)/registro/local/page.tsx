import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateLocalForm } from "@/components/auth/create-local-form";
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
      <h1 className="text-2xl font-semibold">{slugs.length ? "Sumar otro local" : "Tu local"}</h1>
      <p className="mt-1 mb-6 text-[15px] text-muted">Empieza sin publicar: cargás la carta y los horarios, y lo publicás cuando esté listo.</p>
      <CreateLocalForm />
    </>
  );
}
