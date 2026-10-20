import { describe, expect, it } from "vitest";
import type { Schedule } from "@/lib/domain/types";
import { bookableDays, describeWeek, findSlot, getOpenState, isSlotPast, shiftsOn, slotsForServiceDate, weeklySchedule } from "@/lib/domain/schedule";
import { addDays, weekdayOf, zonedNow, type ZonedNow } from "@/lib/time/zoned";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
// 2026-10-23 es viernes.
const FRI = "2026-10-23";
const SAT = "2026-10-24";

const bar: Schedule = weeklySchedule(ALL_DAYS, [{ id: "noche", label: "Noche", open: "18:00", close: "03:00" }]);
const bodegon: Schedule = weeklySchedule([0, 2, 3, 4, 5, 6], [
  // cerrado lunes
  { id: "almuerzo", label: "Almuerzo", open: "12:00", close: "16:00" },
  { id: "cena", label: "Cena", open: "20:00", close: "00:30" },
]);
const at = (date: string, hhmm: string): ZonedNow => {
  const [h, m] = hhmm.split(":").map(Number);
  return { date, minutes: h * 60 + m, weekday: weekdayOf(date) };
};

describe("zonedNow", () => {
  it("convierte un instante a la hora del comercio sin depender del TZ del proceso", () => {
    // 04:30 UTC = 01:30 en Buenos Aires (UTC-3), ya es sábado.
    const now = zonedNow("America/Argentina/Buenos_Aires", new Date("2026-10-24T04:30:00Z"));
    expect(now).toEqual({ date: SAT, minutes: 90, weekday: 6 });
    // Mismo instante en Madrid (UTC+2 en octubre): 06:30 del sábado.
    expect(zonedNow("Europe/Madrid", new Date("2026-10-24T04:30:00Z")).minutes).toBe(6 * 60 + 30);
  });

  it("usa Buenos Aires si la zona es inválida", () => {
    expect(zonedNow("Mars/Olympus", new Date("2026-10-24T04:30:00Z")).date).toBe(SAT);
  });
});

describe("turnos que cruzan medianoche", () => {
  it("asigna los horarios post-medianoche a la fecha de servicio en que abrió el turno", () => {
    const slots = slotsForServiceDate(bar, FRI);
    const last = slots.at(-1)!;
    expect(last.time).toBe("02:00"); // última mesa 1 h antes del cierre
    expect(last.serviceDate).toBe(FRI);
    expect(last.calendarDate).toBe(SAT);
    expect(last.afterMidnight).toBe(true);
    expect(slots[0]).toMatchObject({ time: "18:00", calendarDate: FRI, afterMidnight: false });
  });

  it("ordena cronológicamente: 01:00 va después de 23:30", () => {
    const times = slotsForServiceDate(bar, FRI).map((s) => s.time);
    expect(times.indexOf("01:00")).toBeGreaterThan(times.indexOf("23:30"));
  });

  it("no usa cortes arbitrarios: un turno de madrugada 02:00–07:00 es del mismo día", () => {
    const early: Schedule = weeklySchedule(ALL_DAYS, [{ id: "m", label: "Madrugada", open: "02:00", close: "07:00" }]);
    const slot = findSlot(early, FRI, "03:00")!;
    expect(slot.calendarDate).toBe(FRI);
    expect(slot.afterMidnight).toBe(false);
  });

  it("un turno que cierra a 00:00 cruza medianoche (Sakura 19:30–00:00)", () => {
    const sakura: Schedule = weeklySchedule(ALL_DAYS, [{ id: "c", label: "Cena", open: "19:30", close: "00:00" }]);
    expect(slotsForServiceDate(sakura, FRI).at(-1)!.time).toBe("23:00");
  });

  it("el día cerrado no ofrece horarios, ni siquiera los de madrugada", () => {
    const monday = "2026-10-26";
    expect(slotsForServiceDate(bodegon, monday)).toEqual([]);
  });
});

describe("getOpenState", () => {
  it("a la 01:30 del sábado el bar sigue abierto por el turno del viernes", () => {
    expect(getOpenState(bar, at(SAT, "01:30"))).toMatchObject({ open: true, closesAt: "03:00" });
  });

  it("cierra exactamente a la hora de cierre", () => {
    expect(getOpenState(bar, at(SAT, "03:00")).open).toBe(false);
    expect(getOpenState(bar, at(SAT, "03:00")).label).toBe("Abre hoy a las 18:00");
  });

  it("el lunes a las 00:15 El Bodegón sigue abierto por el servicio del domingo", () => {
    expect(getOpenState(bodegon, at("2026-10-26", "00:15"))).toMatchObject({ open: true, closesAt: "00:30" });
  });

  it("el martes a las 00:15 está cerrado porque el lunes no hubo servicio", () => {
    const state = getOpenState(bodegon, at("2026-10-27", "00:15"));
    expect(state.open).toBe(false);
    expect(state.label).toBe("Abre hoy a las 12:00");
  });

  it("el lunes por la tarde anuncia la próxima apertura del martes", () => {
    expect(getOpenState(bodegon, at("2026-10-26", "17:00")).label).toBe("Abre mañana a las 12:00");
  });

  it("entre turnos informa el siguiente turno del mismo día", () => {
    expect(getOpenState(bodegon, at(FRI, "17:00")).label).toBe("Abre hoy a las 20:00");
  });

  it("sin turnos no promete apertura", () => {
    expect(getOpenState(weeklySchedule(ALL_DAYS, []), at(FRI, "12:00"))).toEqual({ open: false, label: "Sin horarios cargados" });
  });
});

describe("isSlotPast y calendario", () => {
  it("compara contra la fecha calendario, no la de servicio", () => {
    const slot = findSlot(bar, FRI, "01:00")!; // sábado 01:00
    expect(isSlotPast(slot, at(FRI, "23:00"), 30)).toBe(false);
    expect(isSlotPast(slot, at(SAT, "00:45"), 30)).toBe(true); // faltan 15 min < 30 de anticipación
  });

  it("de madrugada ofrece el 'turno actual' (servicio de anoche) si le quedan horarios", () => {
    const days = bookableDays(bar, at(SAT, "00:30"), 14, 30);
    expect(days[0]).toMatchObject({ serviceDate: FRI, label: "Turno actual" });
    expect(days[1]).toMatchObject({ serviceDate: SAT, label: "Hoy" });
    expect(days).toHaveLength(15);
  });

  it("no ofrece el turno de anoche si ya no quedan horarios", () => {
    const days = bookableDays(bar, at(SAT, "02:00"), 14, 30);
    expect(days[0].serviceDate).toBe(SAT);
  });

  it("marca como cerrados los días sin servicio", () => {
    const days = bookableDays(bodegon, at(FRI, "10:00"), 7, 30);
    const monday = days.find((d) => d.serviceDate === addDays(FRI, 3))!;
    expect(monday.closed).toBe(true);
  });
});

describe("horarios por día y cierres excepcionales", () => {
  // Domingo solo almuerzo; viernes además trasnoche que cruza medianoche.
  const mixed: Schedule = {
    week: [
      [{ id: "d0", label: "Almuerzo", open: "12:00", close: "16:30" }],
      [],
      [],
      [],
      [],
      [
        { id: "v1", label: "Almuerzo", open: "12:00", close: "16:00" },
        { id: "v2", label: "Trasnoche", open: "22:00", close: "04:00" },
      ],
      [],
    ],
    closures: [{ date: FRI, reason: "Evento privado" }],
  };
  const SUN = "2026-10-25";
  const NEXT_FRI = "2026-10-30";

  it("cada día ofrece SUS turnos", () => {
    expect(slotsForServiceDate(mixed, SUN).map((s) => s.time)).toEqual(["12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"]);
    const fri = slotsForServiceDate(mixed, NEXT_FRI);
    expect(fri.some((s) => s.time === "20:00")).toBe(false);
    expect(fri.at(-1)).toMatchObject({ time: "03:00", calendarDate: "2026-10-31", afterMidnight: true });
  });

  it("un cierre excepcional prevalece sobre el día de la semana", () => {
    expect(shiftsOn(mixed, FRI)).toEqual([]);
    expect(slotsForServiceDate(mixed, FRI)).toEqual([]);
    const day = bookableDays(mixed, at(FRI, "09:00"), 7, 30).find((d) => d.serviceDate === FRI)!;
    expect(day).toMatchObject({ closed: true, closedReason: "Evento privado" });
    expect(getOpenState(mixed, at(FRI, "13:00")).open).toBe(false);
  });

  it("abierto/cerrado usa los turnos del día (trasnoche del viernes abierta el sábado 02:00)", () => {
    expect(getOpenState(mixed, at("2026-10-31", "02:00"))).toMatchObject({ open: true, closesAt: "04:00" });
    expect(getOpenState(mixed, at("2026-10-31", "13:00")).open).toBe(false);
  });

  it("resume la semana agrupando días con los mismos horarios", () => {
    expect(describeWeek(bodegon)).toEqual(["Mar a Dom · 12:00–16:00 · 20:00–00:30"]);
    expect(describeWeek(mixed)).toEqual(["Vie · 12:00–16:00 · 22:00–04:00", "Dom · 12:00–16:30"]);
  });
});
