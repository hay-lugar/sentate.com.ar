import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateLocalForm } from "@/components/auth/create-local-form";
import { getCurrentUser, getMyTenantSlugs } from "@/lib/data/live/queries";

export const metadata: Metadata = { title: "Tu local", robots: { index: false } };

export default async function NuevoLocalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/registro/local");
  const slugs = await getMyTenantSlugs();
  return (
    <>
      <h1 className="text-2xl font-bold">{slugs.length ? "Sumá otro local" : "Contanos de tu local"}</h1>
      <p className="mt-1 mb-6 text-[14px] text-muted">
        Arranca sin publicar: cargá la carta y los horarios, y publicalo cuando esté listo.
      </p>
      <CreateLocalForm />
    </>
  );
}
