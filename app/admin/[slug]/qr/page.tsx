import { PageHeader } from "@/components/admin/page-header";
import { QrSection } from "@/components/admin/qr-section";
import { appOrigin } from "@/lib/auth/app-url";

export const metadata = { title: "Código QR" };
// El origen sale de APP_URL en tiempo de ejecución: no se congela en el build.
export const dynamic = "force-dynamic";

function configuredOrigin(): string | null {
  try {
    return appOrigin();
  } catch {
    return null;
  }
}

export default function QrPage() {
  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Código QR" />
      </div>
      <QrSection origin={configuredOrigin()} />
    </>
  );
}
