import { redirect } from "next/navigation";
import { getCurrentUser, getMyTenantSlugs } from "@/lib/data/live/queries";

/** /admin: lleva al primer comercio del usuario, al alta del local o al login. */
export default async function AdminIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  const slugs = await getMyTenantSlugs();
  redirect(slugs[0] ? `/admin/${slugs[0]}` : "/registro/local");
}
