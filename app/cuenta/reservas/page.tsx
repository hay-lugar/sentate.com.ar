import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { getMyReservations } from "@/lib/account/queries";
import { STATUS_LABEL, formatWhen } from "@/lib/account/status";
import { cn } from "@/lib/format";

export const metadata = { title: "Mis reservas" };

export default async function ReservasPage() {
  const { total, items } = await getMyReservations();
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-line/70 p-6 text-center">
        <p className="text-[16px] font-medium">Todavía no tenés reservas.</p>
        <p className="mt-1 type-help">Las que pidas con tu cuenta iniciada van a aparecer acá. Las solicitudes hechas sin cuenta no se asocian.</p>
        <Link href="/explorar" className={buttonClass({ className: "mt-4" })}>
          Explorar locales
        </Link>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-3 type-help">{total} {total === 1 ? "reserva" : "reservas"}</p>
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id}>
            <Link href={`/cuenta/reservas/${r.id}`} className="block rounded-2xl border border-line/70 p-4 hover:bg-subtle">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">{r.tenant.name}</p>
                  <p className="type-help">{formatWhen(r.starts_at, r.tenant.timezone)}</p>
                  <p className="type-help">{r.guests} {r.guests === 1 ? "persona" : "personas"}</p>
                </div>
                <span className={cn("rounded-full border px-2.5 py-1 text-[13px] font-medium", r.display_status === "confirmed" ? "border-success/50 text-success" : "border-line-strong text-muted")}>
                  {STATUS_LABEL[r.display_status]}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
