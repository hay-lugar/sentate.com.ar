import { MenuManager } from "@/components/admin/menu-manager";
import { PageHeader } from "@/components/admin/page-header";

export const metadata = { title: "Carta" };

export default function MenuPage() {
  return (
    <>
      <PageHeader eyebrow="Tu carta" title="Menú" />
      <MenuManager />
    </>
  );
}
