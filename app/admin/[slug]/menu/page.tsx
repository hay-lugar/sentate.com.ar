import { LiveLink } from "@/components/admin/live-link";
import { MenuManager } from "@/components/admin/menu-manager";
import { PageHeader } from "@/components/admin/page-header";

export const metadata = { title: "Carta" };

export default function MenuPage() {
  return (
    <>
      <PageHeader title="Menú">
        <LiveLink to="menu/precios">Cambiar precios</LiveLink>
      </PageHeader>
      <MenuManager />
    </>
  );
}
