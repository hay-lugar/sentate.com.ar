// Disponibilidad FICTICIA: un hash determinístico marca ~1 de cada 4 horarios
// como completo. No hay backend ni ocupación real detrás.

import type { Slot } from "@/lib/domain/schedule";

export function hashUnit(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function isSlotFullMock(slug: string, slot: Pick<Slot, "serviceDate" | "time">, guests: number) {
  return hashUnit(`${slug}|${slot.serviceDate}|${slot.time}|${guests}`) < 0.24;
}
