import { notFound } from "next/navigation";
import { Clock3, MapPin, Palette, Phone } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { getTenant } from "@/data/mock";

export const metadata = { title: "Ajustes" };

export default async function AjustesPage({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = getTenant((await params).slug);
  if (!tenant) notFound();

  const rows = [
    { icon: MapPin, label: "Dirección", value: tenant.address },
    { icon: Phone, label: "Teléfono", value: tenant.phone },
    { icon: Clock3, label: "Horario", value: `${tenant.hours.open} a ${tenant.hours.close}` },
  ];

  return (
    <>
      <PageHeader eyebrow="Tu local" title="Ajustes" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-[1.75rem] bg-surface p-2 shadow-soft ring-1 ring-line/70">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-4 rounded-2xl p-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand">
                <Icon className="size-5" />
              </span>
              <div className="leading-tight">
                <p className="text-[12px] font-medium text-muted">{label}</p>
                <p className="font-semibold">{value}</p>
              </div>
            </div>
          ))}
        </section>
        <section className="rounded-[1.75rem] bg-surface p-5 shadow-soft ring-1 ring-line/70">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand">
              <Palette className="size-5" />
            </span>
            <h2 className="text-lg font-bold">Identidad visual</h2>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              ["Primario", tenant.theme.primary],
              ["Acento", tenant.theme.accent],
            ].map(([label, color]) => (
              <div key={label} className="rounded-2xl bg-background p-3">
                <span style={{ background: color }} className="block h-16 rounded-xl ring-1 ring-black/5" />
                <p className="mt-2 text-[12px] font-medium text-muted">{label}</p>
                <p className="font-mono text-[13px] font-semibold uppercase">{color}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-muted">La edición de marca, horarios y equipo llega en la Fase 2.</p>
        </section>
      </div>
    </>
  );
}
