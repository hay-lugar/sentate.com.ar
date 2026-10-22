import { CapacityLink } from "@/components/admin/capacity-link";
import { PageHeader } from "@/components/admin/page-header";
import { ReservasBody } from "./_body";

export const metadata = { title: "Reservas" };

export default async function ReservasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <PageHeader title="Reservas">
        <CapacityLink />
      </PageHeader>
      <ReservasBody slug={slug} />
    </>
  );
}
