// Pruebas contra la Data API REAL local (PostgREST + GoTrue), como un cliente del navegador.
// Requiere `supabase start` + `supabase db reset` (usa supabase/seed.sql).
// Ejecutar: node --test supabase/tests/api/data-api.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, describe, test } from "node:test";

const API = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
// Clave publicable del stack LOCAL (valor por defecto de `supabase start`, no es un secreto de producción).
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const BODEGON = "11111111-1111-4111-8111-111111111111";
const ESQUINA = "22222222-2222-4222-8222-222222222222";

async function login(email) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "sentate-dev-only" }),
  });
  const body = await res.json();
  assert.ok(body.access_token, `login falló para ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function rest(path, { token, method = "GET", body, profile, prefer } = {}) {
  const headers = { apikey: KEY, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (profile) headers["Accept-Profile"] = headers["Content-Profile"] = profile;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${API}/rest/v1/${path}`, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const nextDate = (weekday, minDays = 2) => {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  for (let i = minDays; i < minDays + 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d.getDay() === weekday) return d.toLocaleDateString("en-CA");
  }
};

let bodegon, sakura, outsider;
before(async () => {
  [bodegon, sakura, outsider] = await Promise.all([
    login("owner.bodegon@example.test"),
    login("owner.sakura@example.test"),
    login("sin.local@example.test"),
  ]);
});

describe("visitante (anon)", () => {
  test("lee comercios publicados y carta disponible", async () => {
    const t = await rest("tenants?select=slug&order=slug");
    assert.equal(t.status, 200);
    assert.deepEqual(t.body.map((r) => r.slug), ["prueba-bodegon", "prueba-esquina", "prueba-sakura"]);
    const items = await rest(`menu_items?select=name&tenant_id=eq.${BODEGON}`);
    assert.ok(!items.body.some((i) => i.name === "Bondiola braseada"), "plato no disponible oculto");
  });

  test("no lee reservas, membresías ni suscripciones", async () => {
    for (const table of ["reservations", "tenant_members", "tenant_subscriptions"]) {
      const r = await rest(`${table}?select=*`);
      assert.ok(r.status === 401 || r.status === 403, `${table}: ${r.status}`);
      assert.equal(r.body.code, "42501");
    }
  });

  test("no inserta reservas directamente", async () => {
    const r = await rest("reservations", {
      method: "POST",
      body: { tenant_id: BODEGON, starts_at: new Date().toISOString(), service_date: "2030-01-01", guests: 2, customer_name: "X", customer_phone: "1155550000" },
    });
    assert.equal(r.body.code, "42501");
  });

  test("el esquema private no está expuesto", async () => {
    const r = await rest("settings?select=*", { profile: "private" });
    assert.equal(r.status, 406);
    const rpc = await rest("rpc/request_reservation_impl", { method: "POST", profile: "private", body: {} });
    assert.equal(rpc.status, 406);
  });

  test("solicitud pública: pending, mínima e idempotente", async () => {
    const key = randomUUID();
    const payload = {
      p_tenant_id: ESQUINA, p_service_date: nextDate(5), p_time: "01:00", p_guests: 2,
      p_customer_name: "Prueba API", p_customer_phone: "11 5555 0000", p_notes: "", p_idempotency_key: key,
    };
    const first = await rest("rpc/request_reservation", { method: "POST", body: payload });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.status, "pending");
    assert.equal(first.body.service_date, payload.p_service_date, "01:00 conserva la fecha de servicio");
    assert.deepEqual(Object.keys(first.body).sort(), ["replayed", "reservation_id", "service_date", "starts_at", "status"]);
    const again = await rest("rpc/request_reservation", { method: "POST", body: payload });
    assert.equal(again.body.reservation_id, first.body.reservation_id);
    assert.equal(again.body.replayed, true);
    const bad = await rest("rpc/request_reservation", { method: "POST", body: { ...payload, p_idempotency_key: randomUUID(), p_guests: 40 } });
    assert.equal(bad.body.message, "invalid_guests");
    const extra = await rest("rpc/request_reservation", { method: "POST", body: { ...payload, p_status: "confirmed" } });
    assert.notEqual(extra.status, 200, "no existe un parámetro para forzar el estado");
  });
});

describe("idempotencia bajo concurrencia", () => {
  test("8 envíos simultáneos con la misma clave crean una sola reserva", async () => {
    const payload = {
      p_tenant_id: BODEGON, p_service_date: nextDate(3), p_time: "21:00", p_guests: 3,
      p_customer_name: "Doble Click", p_customer_phone: "11 5555 0101", p_notes: "", p_idempotency_key: randomUUID(),
    };
    const results = await Promise.all(Array.from({ length: 8 }, () => rest("rpc/request_reservation", { method: "POST", body: payload })));
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.body)));
    assert.equal(new Set(results.map((r) => r.body.reservation_id)).size, 1);
    assert.equal(results.filter((r) => !r.body.replayed).length, 1);
  });
});

describe("dueño de El Bodegón", () => {
  test("solo ve sus reservas", async () => {
    const r = await rest("reservations?select=tenant_id", { token: bodegon });
    assert.equal(r.status, 200);
    assert.ok(r.body.length > 0 && r.body.every((x) => x.tenant_id === BODEGON));
  });

  test("no modifica reservas de otro comercio", async () => {
    const r = await rest(`reservations?tenant_id=eq.${ESQUINA}`, {
      token: bodegon, method: "PATCH", body: { status: "confirmed" }, prefer: "return=representation",
    });
    assert.deepEqual(r.body, []);
  });

  test("no edita suscripción, estado operativo ni membresías", async () => {
    const sub = await rest(`tenant_subscriptions?tenant_id=eq.${BODEGON}`, {
      token: bodegon, method: "PATCH", body: { trial_ends_at: "2099-01-01T00:00:00Z" },
    });
    assert.equal(sub.body.code, "42501");
    const status = await rest(`tenants?id=eq.${BODEGON}`, { token: bodegon, method: "PATCH", body: { status: "active" } });
    assert.equal(status.body.code, "42501");
    const member = await rest("tenant_members", { token: outsider, method: "POST", body: { tenant_id: BODEGON, user_id: "00000000-0000-0000-0000-000000000000" } });
    assert.equal(member.body.code, "42501");
  });
});

describe("dueño con prueba vencida (Sakura)", () => {
  test("no opera pero conserva acceso a su cuenta", async () => {
    const res = await rest("reservations?select=id", { token: sakura });
    assert.deepEqual(res.body, []);
    const sub = await rest("tenant_subscriptions?select=status,trial_ends_at", { token: sakura });
    assert.equal(sub.body.length, 1);
    assert.equal(sub.body[0].status, "trialing", "el estado guardado sigue en trialing");
    assert.ok(new Date(sub.body[0].trial_ends_at) < new Date());
    const edit = await rest("menu_items?id=not.is.null&select=id", { token: sakura, method: "PATCH", body: { price: 1 }, prefer: "return=representation" });
    assert.deepEqual(edit.body, []);
  });
});
