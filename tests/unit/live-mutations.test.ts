import { describe, expect, it } from "vitest";
import { liveMutation } from "@/lib/admin/live-mutations";
import { resolveIds, toLiveMutation } from "@/lib/admin/to-live-mutation";
import { demoReducer, type DemoAction, type DemoState } from "@/lib/demo/state";
import { validateSchedule } from "@/lib/demo/profile-validation";
import { weeklySchedule } from "@/lib/domain/schedule";
import type { Reservation } from "@/lib/domain/types";

const T = "2026-10-20T12:00:00.000000+00:00";
const T2 = "2026-10-20T12:05:00.000000+00:00";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const reservation = (over: Partial<Reservation> = {}): Reservation => ({
  id: id(1),
  name: "Ana Pérez",
  phone: "11 0000 0000",
  guests: 2,
  dayOffset: 0,
  time: "21:00",
  status: "pending",
  receivedMinutesAgo: 0,
  version: T,
  ...over,
});

const state = (): DemoState => ({
  slug: "mi-local",
  profile: {
    name: "Mi Local",
    tagline: "",
    cuisine: "Bar",
    priceRange: "$$",
    address: "Calle 1",
    phone: "1100000000",
    timezone: "America/Argentina/Buenos_Aires",
    schedule: weeklySchedule([1, 2], [{ id: "c", label: "Cena", open: "20:00", close: "23:00" }]),
    theme: { primary: "#0f766e", primaryForeground: "#ffffff", accent: "#d9f2ec", accentForeground: "#0b4d47" },
  },
  categories: [
    { id: id(10), name: "Entradas", version: T, dishes: [{ id: id(20), name: "Provoleta", description: "", price: 100, tags: [], active: true, version: T }] },
    { id: id(11), name: "Postres", version: T, dishes: [] },
  ],
  reservations: [reservation()],
});

describe("validación runtime de mutaciones (zod)", () => {
  it("rechaza payloads que TypeScript no detecta en runtime", () => {
    expect(liveMutation.safeParse({ type: "setReservationStatus", id: "no-uuid", status: "confirmed", expectedStatus: "pending" }).success).toBe(false);
    expect(liveMutation.safeParse({ type: "setReservationStatus", id: id(1), status: "pending", expectedStatus: "pending" }).success).toBe(false);
    expect(liveMutation.safeParse({ type: "saveDish", categoryId: id(10), dish: { name: "x", description: "", price: -5, image: null, tags: [], active: true } }).success).toBe(false);
    expect(
      liveMutation.safeParse({
        type: "saveDish",
        categoryId: id(10),
        dish: { name: "Plato", description: "", price: 10, image: "javascript:alert(1)", tags: [], active: true },
      }).success,
    ).toBe(false);
    expect(liveMutation.safeParse({ type: "deleteCategory", categoryId: id(10) }).success).toBe(false); // sin versión
    expect(liveMutation.safeParse({ type: "deleteTenant", id: id(1) }).success).toBe(false);
    expect(liveMutation.safeParse(null).success).toBe(false);
  });

  it("acepta una semana de 7 días y rechaza otra forma", () => {
    const base = {
      type: "saveSettings",
      expectedVersion: T,
      profile: {
        name: "Mi Local",
        tagline: "",
        cuisine: "Bar",
        priceRange: "$$",
        address: "Calle 1",
        phone: "1100000000",
        timezone: "America/Argentina/Buenos_Aires",
        logoUrl: null,
        theme: { primary: "#0f766e", primaryForeground: "#ffffff", accent: "#d9f2ec", accentForeground: "#0b4d47" },
      },
    };
    expect(liveMutation.safeParse({ ...base, schedule: { week: [[], [], [], [], [], [], []], closures: [] } }).success).toBe(true);
    expect(liveMutation.safeParse({ ...base, schedule: { week: [[]], closures: [] } }).success).toBe(false);
    expect(liveMutation.safeParse({ ...base, schedule: null }).success).toBe(true);
    expect(liveMutation.safeParse({ ...base, profile: { ...base.profile, logoUrl: "data:image/png;base64,AAAA" }, schedule: null }).success).toBe(false);
  });
});

describe("acción del panel → mutación real (con versiones vistas)", () => {
  it("estado de reserva lleva el estado esperado", () => {
    expect(toLiveMutation(state(), { type: "setReservationStatus", id: id(1), status: "confirmed" })).toEqual({
      type: "setReservationStatus",
      id: id(1),
      status: "confirmed",
      expectedStatus: "pending",
    });
  });

  it("toggle de plato envía el valor final y la versión (no lee-y-escribe en el server)", () => {
    expect(toLiveMutation(state(), { type: "toggleDish", categoryId: id(10), dishId: id(20) })).toEqual({
      type: "setDishActive",
      dishId: id(20),
      active: false,
      expectedVersion: T,
    });
  });

  it("mover categoría manda el orden COMPLETO para una sola operación atómica", () => {
    expect(toLiveMutation(state(), { type: "moveCategory", categoryId: id(11), direction: -1 })).toEqual({
      type: "reorderCategories",
      orderedIds: [id(11), id(10)],
    });
    expect(toLiveMutation(state(), { type: "moveCategory", categoryId: id(10), direction: -1 })).toBeNull();
  });

  it("cada mutación generada es válida para la Server Action", () => {
    const s = state();
    const actions: DemoAction[] = [
      { type: "renameCategory", categoryId: id(10), name: "Para picar" },
      { type: "deleteCategory", categoryId: id(11) },
      { type: "deleteDish", categoryId: id(10), dishId: id(20) },
      { type: "addCategory", name: "Bebidas" },
      { type: "saveDish", categoryId: id(10), dish: { id: id(20), name: "Provoleta", description: "", price: 120, tags: ["veggie"], active: true } },
    ];
    for (const a of actions) expect(liveMutation.safeParse(toLiveMutation(s, a)).success, a.type).toBe(true);
  });
});

describe("realtime en el reducer", () => {
  it("agrega solicitudes nuevas y deduplica por versión", () => {
    let s = state();
    s = demoReducer(s, { type: "upsertReservation", reservation: reservation({ id: id(2), name: "Bruno" }) });
    expect(s.reservations.map((r) => r.id)).toEqual([id(1), id(2)]);
    // Mismo evento repetido: sin cambios (misma referencia).
    expect(demoReducer(s, { type: "upsertReservation", reservation: reservation({ id: id(2), name: "Bruno" }) })).toBe(s);
    // Evento más nuevo: aplica.
    s = demoReducer(s, { type: "upsertReservation", reservation: reservation({ id: id(2), status: "confirmed", version: T2 }) });
    expect(s.reservations.find((r) => r.id === id(2))?.status).toBe("confirmed");
    // Evento viejo que llega tarde: se ignora.
    s = demoReducer(s, { type: "upsertReservation", reservation: reservation({ id: id(2), status: "pending", version: T }) });
    expect(s.reservations.find((r) => r.id === id(2))?.status).toBe("confirmed");
  });

  it("compara versiones por instante: una más nueva dentro del mismo segundo no se descarta por su formato", () => {
    // Mismo segundo, distinta precisión y zona. Como texto, «…15.5Z» > «…15.51+00:00» y la más nueva se ignoraba.
    const older = "2026-10-20T12:00:15.5Z";
    const newer = "2026-10-20T12:00:15.510000+00:00";
    expect(older > newer).toBe(true); // el defecto: el orden de texto contradice el orden real
    let s = demoReducer(state(), { type: "upsertReservation", reservation: reservation({ id: id(2), status: "confirmed", version: older }) });
    s = demoReducer(s, { type: "upsertReservation", reservation: reservation({ id: id(2), status: "cancelled", version: newer }) });
    expect(s.reservations.find((r) => r.id === id(2))?.status).toBe("cancelled");
    // Y al revés: la más vieja que llega tarde sigue ignorándose.
    s = demoReducer(s, { type: "upsertReservation", reservation: reservation({ id: id(2), status: "confirmed", version: older }) });
    expect(s.reservations.find((r) => r.id === id(2))?.status).toBe("cancelled");
  });

  it("resincronizar reemplaza la lista por la de la base", () => {
    const s = demoReducer(state(), { type: "syncReservations", reservations: [reservation({ id: id(3) })] });
    expect(s.reservations.map((r) => r.id)).toEqual([id(3)]);
  });
});

describe("validación de horarios por día", () => {
  it("detecta superposición entre días contiguos (trasnoche del domingo vs lunes temprano)", () => {
    const errs = validateSchedule({
      week: [[{ id: "a", label: "Noche", open: "22:00", close: "04:00" }], [{ id: "b", label: "Madrugada", open: "02:00", close: "06:00" }], [], [], [], [], []],
      closures: [],
    });
    expect(Object.values(errs).join(" ")).toMatch(/se superpone/);
  });

  it("cierres: fechas inválidas o repetidas", () => {
    const week = weeklySchedule([1], [{ id: "c", label: "Cena", open: "20:00", close: "23:00" }]).week;
    expect(validateSchedule({ week, closures: [{ date: "2026-02-30", reason: "" }] }).closures).toBeTruthy();
    expect(validateSchedule({ week, closures: [{ date: "2026-12-25", reason: "" }, { date: "2026-12-25", reason: "" }] }).closures).toBeTruthy();
    expect(validateSchedule({ week, closures: [{ date: "2026-12-25", reason: "Navidad" }] })).toEqual({});
  });
});

describe("altas encadenadas (ID temporal → real)", () => {
  it("una acción encolada sobre una categoría recién creada usa el ID real confirmado", () => {
    let s = demoReducer(state(), { type: "addCategory", name: "Bebidas" });
    const temp = s.categories.at(-1)!.id;
    const queued: DemoAction = { type: "saveDish", categoryId: temp, dish: { name: "Agua", description: "", price: 900, tags: [], active: true } };
    // Antes de que la base confirme: no hay mutación posible (se avisa, no se inventa un ID).
    expect(toLiveMutation(s, queued)).toBeNull();
    // La base confirma el alta: el estado y la acción encolada pasan al ID real.
    s = demoReducer(s, { type: "confirmCreated", entity: "category", tempId: temp, id: id(99), version: T });
    const resolved = resolveIds(queued, new Map([[temp, id(99)]]));
    expect(s.categories.at(-1)).toMatchObject({ id: id(99), version: T });
    expect(toLiveMutation(s, resolved)).toMatchObject({ type: "saveDish", categoryId: id(99) });
  });
});
