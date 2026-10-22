"use client";

import { useDemo } from "./demo-provider";
import { useReservationsOff } from "./reservations-off";

/** Resumen operativo: lo que hay que atender hoy. Solo datos del local, sin métricas de uso. */
export function StatCards() {
  const { state } = useDemo();
  const dishes = state.categories.flatMap((c) => c.dishes);
  const activeDishes = dishes.filter((d) => d.active).length;
  // Fecha de servicio de hoy (incluye turnos después de medianoche).
  const today = state.reservations.filter((r) => r.dayOffset === 0 && r.status !== "rejected" && r.status !== "cancelled");
  const covers = today.reduce((n, r) => n + r.guests, 0);
  const pending = state.reservations.filter((r) => r.status === "pending").length;
  const off = useReservationsOff();

  if (off) {
    return (
      <dl className="grid grid-cols-1 divide-y divide-line rounded-xl border border-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Stat label="Platos activos" value={activeDishes} note={`de ${dishes.length} en la carta`} />
        <Stat label="Categorías" value={state.categories.length} note="en la carta" />
      </dl>
    );
  }

  return (
    <dl className="grid grid-cols-1 divide-y divide-line rounded-xl border border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Stat label="Solicitudes pendientes" value={pending} note="esperando respuesta" />
      <Stat label="Mesas de hoy" value={today.length} note={`${covers} ${covers === 1 ? "cubierto" : "cubiertos"}`} />
      <Stat label="Platos activos" value={activeDishes} note={`de ${dishes.length} en la carta`} />
    </dl>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="type-help">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
      <dd className="mt-0.5 type-help">{note}</dd>
    </div>
  );
}
