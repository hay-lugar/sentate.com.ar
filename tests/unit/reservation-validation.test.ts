import { describe, expect, it } from "vitest";
import type { Schedule } from "@/lib/domain/types";
import {
  EMPTY_DRAFT,
  RESERVATION_LIMITS,
  stepForErrors,
  validateContact,
  validateGuests,
  validateReservation,
  validateSlot,
  type ReservationDraft,
  type ValidationContext,
} from "@/lib/reservation/validation";
import { weekdayOf, type ZonedNow } from "@/lib/time/zoned";
import { weeklySchedule } from "@/lib/domain/schedule";

// Cerrado lunes.
const schedule: Schedule = weeklySchedule([0, 2, 3, 4, 5, 6], [{ id: "cena", label: "Cena", open: "20:00", close: "00:30" }]);
const FRI = "2026-10-23";
const at = (date: string, hhmm: string): ZonedNow => {
  const [h, m] = hhmm.split(":").map(Number);
  return { date, minutes: h * 60 + m, weekday: weekdayOf(date) };
};
const ctx = (now: ZonedNow, full = false): ValidationContext => ({ schedule, now, isFull: () => full });
const valid: ReservationDraft = { guests: 4, serviceDate: FRI, time: "21:30", name: "Ana Pérez", phone: "11 5555-1234", notes: "" };

describe("validateGuests", () => {
  it.each([0, 9, 2.5, Number.NaN])("rechaza %s", (n) => expect(validateGuests(n).guests).toBeDefined());
  it.each([1, 8])("acepta %s", (n) => expect(validateGuests(n)).toEqual({}));
});

describe("validateSlot", () => {
  it("exige día y horario", () => {
    expect(validateSlot({ ...valid, serviceDate: null }, ctx(at(FRI, "12:00"))).serviceDate).toBeDefined();
    expect(validateSlot({ ...valid, time: null }, ctx(at(FRI, "12:00"))).time).toBeDefined();
  });

  it("rechaza un día cerrado", () => {
    expect(validateSlot({ ...valid, serviceDate: "2026-10-26" }, ctx(at(FRI, "12:00"))).serviceDate).toMatch(/no abre/);
  });

  it("rechaza fechas fuera de la ventana de reservas", () => {
    expect(validateSlot({ ...valid, serviceDate: "2026-11-30" }, ctx(at(FRI, "12:00"))).serviceDate).toMatch(/fuera/);
    expect(validateSlot({ ...valid, serviceDate: "2026-10-20" }, ctx(at(FRI, "12:00"))).serviceDate).toMatch(/fuera/);
  });

  it("rechaza horarios que no existen en el turno", () => {
    expect(validateSlot({ ...valid, time: "18:00" }, ctx(at(FRI, "12:00"))).time).toMatch(/no existe/);
    expect(validateSlot({ ...valid, time: "25:00" }, ctx(at(FRI, "12:00"))).time).toBeDefined();
  });

  it("rechaza un horario que ya pasó o está dentro de la anticipación mínima", () => {
    expect(validateSlot(valid, ctx(at(FRI, "21:10"))).time).toMatch(/pasó/);
    expect(validateSlot(valid, ctx(at(FRI, "20:59")))).toEqual({});
  });

  it("acepta la madrugada del servicio de anoche mientras siga vigente", () => {
    const late: Schedule = weeklySchedule([5], [{ id: "n", label: "Noche", open: "20:00", close: "03:00" }]);
    const lateCtx = (now: ZonedNow): ValidationContext => ({ schedule: late, now, isFull: () => false });
    const draft = { ...valid, serviceDate: FRI, time: "01:30" }; // sábado 01:30, servicio del viernes
    expect(validateSlot(draft, lateCtx(at("2026-10-24", "00:10")))).toEqual({});
    expect(validateSlot(draft, lateCtx(at("2026-10-24", "01:10"))).time).toMatch(/pasó/);
  });

  it("rechaza un horario completo (disponibilidad ficticia)", () => {
    expect(validateSlot(valid, ctx(at(FRI, "12:00"), true)).time).toMatch(/complet/);
  });
});

describe("validateContact", () => {
  it("valida nombre, teléfono y largo de comentarios", () => {
    const e = validateContact({ name: " a ", phone: "123", notes: "x".repeat(RESERVATION_LIMITS.notesMax + 1) });
    expect(Object.keys(e).sort()).toEqual(["name", "notes", "phone"]);
  });

  it("rechaza caracteres no telefónicos", () => {
    expect(validateContact({ name: "Ana", phone: "11 5555 abcd", notes: "" }).phone).toMatch(/solo números/);
  });

  it("acepta formatos habituales", () => {
    expect(validateContact({ name: "Ana", phone: "+54 (11) 5555-1234", notes: "" })).toEqual({});
  });
});

describe("validateReservation (revalidación al confirmar)", () => {
  it("acepta un borrador completo", () => {
    expect(validateReservation(valid, ctx(at(FRI, "12:00"))).ok).toBe(true);
  });

  it("detecta que el turno pasó mientras el usuario completaba el formulario", () => {
    const result = validateReservation(valid, ctx(at(FRI, "21:15")));
    expect(result.ok).toBe(false);
    expect(stepForErrors(result.errors)).toBe(1);
  });

  it("reporta todos los campos inválidos y vuelve al primer paso con error", () => {
    const result = validateReservation({ ...EMPTY_DRAFT, guests: 12 }, ctx(at(FRI, "12:00")));
    expect(result.ok).toBe(false);
    expect(result.errors.guests && result.errors.serviceDate && result.errors.name && result.errors.phone).toBeTruthy();
    expect(stepForErrors(result.errors)).toBe(0);
  });
});
