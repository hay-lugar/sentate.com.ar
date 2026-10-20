import { describe, expect, it } from "vitest";
import { MAX_RESYNC_ATTEMPTS, ReservationSyncStore, isNewer, retryDelay } from "@/components/admin/reservation-sync";

type Row = { id: string; updated_at: string; status: string };
const row = (id: string, updated_at: string, status = "pending"): Row => ({ id, updated_at, status });

describe("isNewer", () => {
  it("compara por instante, no por texto (precisión fraccionaria distinta)", () => {
    expect(isNewer("2026-10-20T10:00:00.5+00:00", "2026-10-20T10:00:00.123+00:00")).toBe(true);
    expect(isNewer("2026-10-20T10:00:00+00:00", "2026-10-20T10:00:00.001+00:00")).toBe(false);
  });
});

describe("ReservationSyncStore", () => {
  it("una versión vieja no pisa una más nueva", () => {
    const s = new ReservationSyncStore<Row>();
    expect(s.apply(row("a", "2026-10-20T10:00:02Z", "confirmed")).applied).toBe(true);
    const late = s.apply(row("a", "2026-10-20T10:00:01Z", "pending"));
    expect(late).toEqual({ applied: false, isNew: false });
  });

  it("una resincronización no retrocede una fila ya aplicada más nueva", () => {
    const s = new ReservationSyncStore<Row>();
    s.apply(row("a", "2026-10-20T10:00:05Z", "confirmed"));
    // La lectura llegó con la versión anterior (se leyó antes de la escritura).
    const merged = s.replaceAll([row("a", "2026-10-20T10:00:01Z", "pending"), row("b", "2026-10-20T10:00:00Z")]);
    expect(merged.find((r) => r.id === "a")?.status).toBe("confirmed");
    expect(merged.find((r) => r.id === "b")).toBeDefined();
  });

  it("una resincronización trae versiones más nuevas que las locales", () => {
    const s = new ReservationSyncStore<Row>();
    s.apply(row("a", "2026-10-20T10:00:01Z", "pending"));
    const merged = s.replaceAll([row("a", "2026-10-20T10:00:09Z", "cancelled")]);
    expect(merged[0].status).toBe("cancelled");
    // Y la copia guardada queda actualizada: un evento viejo no la vuelve a pisar.
    expect(s.apply(row("a", "2026-10-20T10:00:05Z", "pending")).applied).toBe(false);
  });

  it("deduplica: no pide de nuevo una versión ya aplicada ni una en vuelo igual o más nueva", () => {
    const s = new ReservationSyncStore<Row>();
    expect(s.needsFetch("a", "2026-10-20T10:00:01Z")).toBe(true);
    s.beginFetch("a", "2026-10-20T10:00:01Z");
    expect(s.needsFetch("a", "2026-10-20T10:00:01Z")).toBe(false);
    expect(s.needsFetch("a", "2026-10-20T10:00:00Z")).toBe(false);
    expect(s.needsFetch("a", "2026-10-20T10:00:02Z")).toBe(true);
    s.endFetch("a", "2026-10-20T10:00:01Z");
    s.apply(row("a", "2026-10-20T10:00:01Z"));
    expect(s.needsFetch("a", "2026-10-20T10:00:01Z")).toBe(false);
  });

  it("una lectura fallida no se marca como procesada: la misma versión se puede volver a pedir", () => {
    const s = new ReservationSyncStore<Row>();
    s.beginFetch("a", "2026-10-20T10:00:01Z");
    // La lectura falló: se libera sin aplicar nada.
    s.endFetch("a", "2026-10-20T10:00:01Z");
    expect(s.needsFetch("a", "2026-10-20T10:00:01Z")).toBe(true);
  });

  it("endFetch de una versión vieja no libera la lectura de una más nueva", () => {
    const s = new ReservationSyncStore<Row>();
    s.beginFetch("a", "2026-10-20T10:00:01Z");
    s.beginFetch("a", "2026-10-20T10:00:03Z");
    s.endFetch("a", "2026-10-20T10:00:01Z");
    expect(s.needsFetch("a", "2026-10-20T10:00:03Z")).toBe(false);
  });

  it("reset borra el estado para una nueva suscripción o cambio de tenant", () => {
    const s = new ReservationSyncStore<Row>();
    s.apply(row("a", "2026-10-20T10:00:05Z"));
    s.beginFetch("b", "2026-10-20T10:00:05Z");
    s.reset();
    expect(s.needsFetch("a", "2026-10-20T10:00:01Z")).toBe(true);
    expect(s.needsFetch("b", "2026-10-20T10:00:05Z")).toBe(true);
    expect(s.apply(row("a", "2026-10-20T10:00:01Z")).isNew).toBe(true);
  });
});

describe("retryDelay", () => {
  it("crece exponencialmente con tope y hay un máximo de intentos", () => {
    expect([0, 1, 2, 3].map(retryDelay)).toEqual([1000, 2000, 4000, 8000]);
    expect(retryDelay(20)).toBe(30_000);
    expect(MAX_RESYNC_ATTEMPTS).toBeGreaterThan(0);
  });
});
