import { describe, expect, it } from "vitest";
import { liveToPublicTenant, localTime, rowToReservation, rowsToCategories, rowsToSchedule, type TenantRow } from "@/lib/data/live/mappers";
import { reservationErrorInfo } from "@/lib/reservation/errors";
import { safeNext } from "@/lib/auth/redirects";

const tenant: TenantRow = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "mi-local",
  name: "Mi Local",
  tagline: "",
  cuisine: "Bar",
  price_range: "$$",
  address: "Calle 1",
  phone: "",
  timezone: "America/Argentina/Buenos_Aires",
  logo_url: null,
  cover_url: null,
  primary_color: "#0f766e",
  primary_fg_color: "#ffffff",
  accent_color: "#d9f2ec",
  accent_fg_color: "#0b4d47",
  is_published: true,
};

describe("rowsToSchedule", () => {
  it("agrupa filas por día en openDays + turnos", () => {
    const rows = [1, 2].flatMap((d) => [
      { weekday: d, label: "Cena", opens_at: "20:00:00", closes_at: "00:30:00" },
      { weekday: d, label: "Almuerzo", opens_at: "12:00:00", closes_at: "16:00:00" },
    ]);
    const s = rowsToSchedule(rows);
    expect(s.openDays).toEqual([1, 2]);
    expect(s.shifts.map((x) => `${x.label} ${x.open}-${x.close}`)).toEqual(["Almuerzo 12:00-16:00", "Cena 20:00-00:30"]);
    expect(s.uniform).toBe(true);
  });

  it("detecta horarios distintos por día", () => {
    const s = rowsToSchedule([
      { weekday: 1, label: "A", opens_at: "12:00:00", closes_at: "16:00:00" },
      { weekday: 2, label: "A", opens_at: "13:00:00", closes_at: "16:00:00" },
    ]);
    expect(s.uniform).toBe(false);
  });

  it("sin filas: sin días ni turnos", () => {
    expect(rowsToSchedule([])).toEqual({ openDays: [], shifts: [], uniform: true });
  });
});

describe("carta", () => {
  it("ordena por posición, convierte numeric a número y filtra etiquetas desconocidas", () => {
    const cats = rowsToCategories(
      [
        { id: "c2", name: "Postres", position: 1, is_visible: true },
        { id: "c1", name: "Entradas", position: 0, is_visible: true },
      ],
      [
        { id: "i2", category_id: "c1", name: "B", description: "", price: "100.00", image_url: null, tags: ["veggie", "x"], is_available: true, position: 1 },
        { id: "i1", category_id: "c1", name: "A", description: "", price: 50, image_url: null, tags: [], is_available: false, position: 0 },
      ],
    );
    expect(cats.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(cats[0].dishes.map((d) => [d.id, d.price, d.active])).toEqual([["i1", 50, false], ["i2", 100, true]]);
    expect(cats[0].dishes[1].tags).toEqual(["veggie"]);
  });

  it("el contrato público excluye no disponibles y categorías ocultas o vacías, e incluye el id", () => {
    const pub = liveToPublicTenant(
      tenant,
      [],
      [
        { id: "c1", name: "Visible", position: 0, is_visible: true },
        { id: "c2", name: "Oculta", position: 1, is_visible: false },
      ],
      [
        { id: "i1", category_id: "c1", name: "Disponible", description: "", price: 1, image_url: null, tags: [], is_available: true, position: 0 },
        { id: "i2", category_id: "c1", name: "Agotado", description: "", price: 1, image_url: null, tags: [], is_available: false, position: 1 },
        { id: "i3", category_id: "c2", name: "Escondido", description: "", price: 1, image_url: null, tags: [], is_available: true, position: 0 },
      ],
    );
    expect(pub.id).toBe(tenant.id);
    expect(pub.categories.map((c) => [c.name, c.dishes.map((d) => d.name)])).toEqual([["Visible", ["Disponible"]]]);
    expect(JSON.stringify(pub)).not.toMatch(/is_published|is_available/);
  });
});

describe("reservas", () => {
  it("01:00 del turno de anoche: hora local correcta y fecha de servicio de hoy", () => {
    // 2026-10-24 04:00 UTC = sábado 01:00 en Buenos Aires; servicio del viernes 23.
    expect(localTime("2026-10-24T04:00:00Z", "America/Argentina/Buenos_Aires")).toBe("01:00");
    const r = rowToReservation(
      {
        id: "r1",
        starts_at: "2026-10-24T04:00:00Z",
        service_date: "2026-10-23",
        guests: 2,
        customer_name: "Ana",
        customer_phone: "1155550000",
        notes: "",
        status: "pending",
        created_at: "2026-10-23T20:00:00Z",
      },
      "America/Argentina/Buenos_Aires",
      { date: "2026-10-23", minutes: 21 * 60, weekday: 5 },
      Date.parse("2026-10-24T00:30:00Z"),
    );
    expect(r).toMatchObject({ dayOffset: 0, time: "01:00", receivedMinutesAgo: 270, notes: undefined });
  });
});

describe("errores y redirecciones", () => {
  it("traduce los códigos de la base y vuelve al paso correcto", () => {
    expect(reservationErrorInfo("slot_too_soon")).toMatchObject({ field: "time" });
    expect(reservationErrorInfo("tenant_unavailable").field).toBeUndefined();
    expect(reservationErrorInfo("desconocido").retryable).toBe(true);
  });

  it.each([
    ["/admin/mi-local", "/admin/mi-local"],
    ["//evil.com", null],
    ["https://evil.com", null],
    ["/\\evil.com", null],
    [null, null],
  ])("safeNext(%s) → %s", (input, expected) => expect(safeNext(input)).toBe(expected));
});
