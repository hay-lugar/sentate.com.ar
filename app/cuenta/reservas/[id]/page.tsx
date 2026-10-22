import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CancelReservation } from "@/components/account/cancel-reservation";
import { buttonClass } from "@/components/ui/button";
import { getMyReservation } from "@/lib/account/queries";
import { STATUS_HELP, STATUS_LABEL, formatWhen } from "@/lib/account/status";

export const metadata = { title: "Reserva" };

export default async function ReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const r = await getMyReservation(id);
  if (!r) notFound();
  const phoneDigits = r.tenant.phone.replace(/[^0-9+]/g, "");

  return (
    <div className="max-w-xl space-y-6">
      <Link href="/cuenta/reservas" className="inline-flex min-h-11 items-center text-[0.9375rem] text-muted hover:text-foreground">
        ← Mis reservas
      </Link>
      <div>
        <p className="type-label">{STATUS_LABEL[r.display_status]}</p>
        <h2 className="type-heading">{r.tenant.name}</h2>
        <p className="mt-1 text-[0.9375rem] text-muted">{STATUS_HELP[r.display_status]}</p>
      </div>
      <dl className="space-y-2 text-[0.9375rem]">
        <Row label="Cuándo" value={formatWhen(r.starts_at, r.tenant.timezone)} />
        <Row label="Personas" value={String(r.guests)} />
        {r.tenant.address && <Row label="Dónde" value={r.tenant.address} />}
        {r.notes && <Row label="Tu comentario" value={r.notes} />}
        <Row label="Pedida el" value={formatWhen(r.created_at, r.tenant.timezone)} />
      </dl>
      {r.status === "pending" && r.respond_by && (
        <p className="rounded-2xl bg-subtle p-3 text-[0.9375rem] leading-relaxed">
          El local puede responder hasta el <b className="font-semibold">{formatWhen(r.respond_by, r.tenant.timezone)}</b>. Si no lo hace, la solicitud vence sola y no queda
          ninguna mesa reservada.
        </p>
      )}
      {r.can_cancel && <CancelReservation id={r.id} pending={r.status === "pending"} cutoffHours={r.cancel_cutoff_hours} />}
      {!r.can_cancel && (r.status === "pending" || r.status === "confirmed") && r.display_status !== "finished" && r.display_status !== "expired" && (
        <p className="type-help">Falta poco para esta reserva: para cambiarla o cancelarla, comunicate con el local.</p>
      )}
      {r.tenant.visible && ["rejected", "cancelled", "expired", "no_show"].includes(r.display_status) && (
        <p className="text-[0.9375rem]">
          <Link href={`/${r.tenant.slug}?mesa=1`} className={buttonClass({ variant: "secondary" })}>
            Pedir otra mesa
          </Link>
        </p>
      )}
      {r.tenant.visible && r.can_cancel && (
        <p className="type-help">
          ¿Querés cambiar el día o el horario? No se edita una reserva: pedí una mesa nueva ({" "}
          <Link href={`/${r.tenant.slug}?mesa=1`} className="underline underline-offset-4">
            pedir otra mesa
          </Link>
          ) y después cancelá esta.
        </p>
      )}
      <div className="flex flex-wrap gap-4 text-[0.9375rem]">
        {r.tenant.visible && (
          <Link href={`/${r.tenant.slug}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
            Ver la carta
          </Link>
        )}
        {phoneDigits && (
          <a href={`tel:${phoneDigits}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
            Llamar al local
          </a>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}
