import { describe, expect, it } from "vitest";
import { liveToPublicTenant, localTime, rowToProfile, rowToReservation, rowsToCategories, rowsToSchedule, type TenantRow } from "@/lib/data/live/mappers";
import { toSettingsMutation } from "@/lib/admin/to-live-mutation";
import { liveMutation } from "@/lib/admin/live-mutations";
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
  phone: "+54 11 0000-0000",
  timezone: "America/Argentina/Buenos_Aires",
  logo_url: null,
  cover_url: null,
  primary_color: "#0f766e",
  primary_fg_color: "#ffffff",
  accent_color: "#d9f2ec",
  accent_fg_color: "#0b4d47",
  is_published: true,
  updated_at: "2026-10-20T12:00:00.000000+00:00",
};

describe("rowsToSchedule (sin pérdida)", () => {
  const row = (id: string, weekday: number, label: string, open: string, close: string) => ({
    id,
    weekday,
    label,
    opens_at: `${open}:00`,
    closes_at: `${close}:00`,
  });

  it("conserva turnos DISTINTOS por día, ordenados, con su id real", () => {
    const s = rowsToSchedule([
      row("b", 2, "Cena", "20:00", "00:30"),
      row("a", 2, "Almuerzo", "12:00", "16:00"),
      row("c", 0, "Almuerzo", "12:00", "16:30"),
      row("d", 6, "Trasnoche", "22:00", "04:00"),
    ]);
    expect(s.week).toHaveLength(7);
    expect(s.week[0].map((x) => `${x.id} ${x.label} ${x.open}-${x.close}`)).toEqual(["c Almuerzo 12:00-16:30"]);
    expect(s.week[1]).toEqual([]);
    expect(s.week[2].map((x) => `${x.label} ${x.open}-${x.close}`)).toEqual(["Almuerzo 12:00-16:00", "Cena 20:00-00:30"]);
    expect(s.week[6].map((x) => `${x.label} ${x.open}-${x.close}`)).toEqual(["Trasnoche 22:00-04:00"]);
  });

  it("incluye cierres excepcionales ordenados", () => {
    const s = rowsToSchedule([], [
      { service_date: "2026-12-31", reason: "" },
      { service_date: "2026-12-25", reason: "Navidad" },
    ]);
    expect(s.closures).toEqual([
      { date: "2026-12-25", reason: "Navidad" },
      { date: "2026-12-31", reason: "" },
    ]);
  });

  it("lectura → edición → payload: cada día sobrevive intacto (no se colapsa al primer día)", () => {
    const rows = [row("a", 1, "Almuerzo", "12:00", "15:00"), row("b", 5, "Cena", "20:00", "01:00"), row("c", 5, "Almuerzo", "12:00", "15:30")];
    const profile = rowToProfile(tenant, rows, [{ service_date: "2026-12-25", reason: "Navidad" }]);
    // El dueño solo cambia el turno del lunes.
    const edited = {
      ...profile,
      schedule: { ...profile.schedule, week: profile.schedule.week.map((d, i) => (i === 1 ? [{ ...d[0], close: "15:30" }] : d)) },
    };
    const m = toSettingsMutation(edited, true, tenant.updated_at);
    expect(m.type === "saveSettings" && m.schedule?.week).toEqual([
      [],
      [{ label: "Almuerzo", open: "12:00", close: "15:30" }],
      [],
      [],
      [],
      [
        { label: "Almuerzo", open: "12:00", close: "15:30" },
        { label: "Cena", open: "20:00", close: "01:00" },
      ],
      [],
    ]);
    expect(m.type === "saveSettings" && m.schedule?.closures).toEqual([{ date: "2026-12-25", reason: "Navidad" }]);
    // Y el payload es válido para la Server Action.
    expect(liveMutation.safeParse(m).success).toBe(true);
  });

  it("guardar solo datos/colores no envía horarios", () => {
    const profile = rowToProfile(tenant, [row("a", 1, "Almuerzo", "12:00", "15:00")]);
    const m = toSettingsMutation({ ...profile, theme: { ...profile.theme, primary: "#000000" } }, false, tenant.updated_at);
    expect(m.type === "saveSettings" && m.schedule).toBeNull();
  });

  it("sin filas: 7 días cerrados", () => {
    expect(rowsToSchedule([])).toEqual({ week: [[], [], [], [], [], [], []], closures: [] });
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
        customer_phone: "1100000000",
        notes: "",
        status: "pending",
        created_at: "2026-10-23T20:00:00Z",
        updated_at: "2026-10-23T20:00:00Z",
      },
      "America/Argentina/Buenos_Aires",
      { date: "2026-10-23", minutes: 21 * 60, weekday: 5 },
      Date.parse("2026-10-24T00:30:00Z"),
    );
    expect(r).toMatchObject({ dayOffset: 0, time: "01:00", receivedMinutesAgo: 270, notes: undefined, version: "2026-10-23T20:00:00Z" });
  });

  it("cancelled se conserva como Cancelada (no se mezcla con rechazada)", () => {
    const r = rowToReservation(
      {
        id: "r2",
        starts_at: "2026-10-24T00:00:00Z",
        service_date: "2026-10-23",
        guests: 2,
        customer_name: "Ana",
        customer_phone: "1100000000",
        notes: "",
        status: "cancelled",
        created_at: "2026-10-23T20:00:00Z",
        updated_at: "2026-10-23T21:00:00Z",
      },
      "America/Argentina/Buenos_Aires",
      { date: "2026-10-23", minutes: 21 * 60, weekday: 5 },
      Date.parse("2026-10-24T00:30:00Z"),
    );
    expect(r.status).toBe("cancelled");
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
    ["/\t/evil.com", null],
    ["/\n/evil.com", null],
    ["/\r/evil.com", null],
    ["/\u0000/x", null],
    ["/admin?x=1", "/admin?x=1"],
    [null, null],
  ])("safeNext(%s) → %s", (input, expected) => expect(safeNext(input)).toBe(expected));
});

import { publicLinks } from "@/lib/data/live/mappers";
import { restaurantJsonLd } from "@/lib/seo/structured-data";
import type { PublicTenant } from "@/lib/domain/types";

describe("enlaces públicos del local", () => {
  it("solo pasa enlaces https y no agrega la propiedad si no hay ninguno", () => {
    expect(publicLinks({ website_url: null, instagram_url: null, facebook_url: null })).toEqual({});
    expect(publicLinks({ website_url: "http://inseguro.test", instagram_url: "javascript:alert(1)", facebook_url: "" })).toEqual({});
    expect(publicLinks({ website_url: "https://mi-local.test", instagram_url: "https://www.instagram.com/mi.local", facebook_url: null })).toEqual({
      links: { website: "https://mi-local.test", instagram: "https://www.instagram.com/mi.local" },
    });
    expect(publicLinks({})).toEqual({});
  });

  it("los datos estructurados incluyen sameAs solo con enlaces", () => {
    const base = {
      slug: "x", name: "X", tagline: "", cuisine: "", priceRange: "$$", address: "Calle 1", phone: "", timezone: "America/Argentina/Buenos_Aires",
      schedule: { week: [[], [], [], [], [], [], []], exceptions: [] }, theme: {}, categories: [],
      discovery: { lat: -34.6, lng: -58.4, locality: "CABA", province: "caba" },
    } as unknown as PublicTenant;
    expect(restaurantJsonLd(base, "https://x.test")).not.toHaveProperty("sameAs");
    const withLinks = { ...base, links: { instagram: "https://www.instagram.com/x" } };
    expect(restaurantJsonLd(withLinks, "https://x.test")?.sameAs).toEqual(["https://www.instagram.com/x"]);
  });
});
