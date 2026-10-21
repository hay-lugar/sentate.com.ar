import { describe, expect, it } from "vitest";
import { STATUS_LABEL, cancelErrorMessage, formatWhen } from "@/lib/account/status";

describe("historial del comensal", () => {
  it("nombra todos los estados pedidos", () => {
    expect(Object.values(STATUS_LABEL)).toEqual(expect.arrayContaining(["Pendiente", "Confirmada", "Rechazada", "Cancelada", "Finalizada"]));
  });
  it("muestra la hora en la zona del comercio, no la del dispositivo", () => {
    // 00:30 UTC = 21:30 del día anterior en Buenos Aires.
    expect(formatWhen("2026-11-07T00:30:00Z", "America/Argentina/Buenos_Aires")).toContain("21:30");
    expect(formatWhen("2026-11-07T00:30:00Z", "America/Argentina/Buenos_Aires")).toMatch(/Viernes/);
  });
  it("explica por qué no se puede cancelar", () => {
    expect(cancelErrorMessage("cancel_too_late")).toMatch(/Comunicate con el local/);
    expect(cancelErrorMessage("otro")).toMatch(/Probá de nuevo/);
  });
});
