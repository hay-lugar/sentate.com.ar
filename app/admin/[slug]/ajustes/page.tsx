import { PageHeader } from "@/components/admin/page-header";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata = { title: "Ajustes" };

export default function AjustesPage() {
  return (
    <>
      <PageHeader eyebrow="Tu local" title="Ajustes" />
      <SettingsForm />
    </>
  );
}
