import { redirect } from "next/navigation";
import { getCurrentUser, getMyTenantSlugs } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";

/** /admin: lleva al primer comercio del usuario, al alta del local o al login. */
export default async function AdminIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  const slugs = await getMyTenantSlugs();
  if (slugs.status !== "ok") throw new TemporaryDataError("tus locales");
  redirect(slugs.data[0] ? `/admin/${slugs.data[0]}` : "/registro/local");
}
