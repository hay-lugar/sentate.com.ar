// Concurrencia de reservas contra la Data API REAL local (PostgREST + GoTrue): ninguna ráfaga de pedidos simultáneos puede
// vender más cupo del configurado. Requiere `supabase start` + `supabase db reset` (usa supabase/seed.sql).
// Ejecutar: node --test supabase/tests/api/capacity-concurrency.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

const API = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const BODEGON = "11111111-1111-4111-8111-111111111111";
const TZ = "America/Argentina/Buenos_Aires";

async function login(email) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "sentate-dev-only" }),
  });
  const body = await res.json();
  assert.ok(body.access_token, `login falló: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function call(path, { token, method = "POST", body } = {}) {
  const headers = { apikey: KEY, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}/rest/v1/${path}`, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const nextDate = (weekday, minDays = 2) => {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  for (let i = minDays; i < minDays + 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d.getDay() === weekday) return d.toLocaleDateString("en-CA");
  }
};

const request = (date, time, guests, n, key = randomUUID()) =>
  call("rpc/request_reservation", {
    body: {
      p_tenant_id: BODEGON, p_service_date: date, p_time: time, p_guests: guests,
      p_customer_name: `Concurrencia ${n}`, p_customer_phone: `11 0000 ${String(1000 + n)}`, p_notes: "", p_idempotency_key: key,
    },
  });

let owner;
before(async () => {
  owner = await login("owner.bodegon@example.test");
  const r = await call("rpc/save_reservation_settings", {
    token: owner,
    body: { p_tenant_id: BODEGON, p_settings: { capacity_guests: 10, occupancy_minutes: 90, slot_interval_minutes: 30, pending_hold_minutes: 240 } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

after(async () => {
  // Deja el comercio como estaba: sin tope y sin pendientes de esta prueba.
  const mine = await call("reservations?select=id&customer_name=like.Concurrencia*&status=eq.pending", { token: owner, method: "GET" });
  for (const row of mine.body ?? []) await call(`reservations?id=eq.${row.id}`, { token: owner, method: "PATCH", body: { status: "rejected" } });
  await call("rpc/save_reservation_settings", { token: owner, body: { p_tenant_id: BODEGON, p_settings: { capacity_guests: null } } });
});

describe("capacidad bajo concurrencia", () => {
  test("12 pedidos simultáneos de 2 personas para un tope de 10: entran exactamente 5", async () => {
    const date = nextDate(4);
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => request(date, "21:00", 2, i + 1)));
    const ok = results.filter((r) => r.status === 200);
    const full = results.filter((r) => r.status >= 400 && r.body?.message === "slot_full");
    assert.equal(ok.length, 5, JSON.stringify(results.map((r) => r.body)));
    assert.equal(full.length, 7);
    assert.equal(results.length, ok.length + full.length, "no hay otros errores");
  });

  test("ocupación solapada (21:00 y 21:30): el pico nunca supera el tope", async () => {
    const date = nextDate(5);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => request(date, i % 2 ? "21:30" : "21:00", 2, 100 + i)),
    );
    const ok = results.filter((r) => r.status === 200);
    assert.ok(ok.length <= 5, `se aceptaron ${ok.length} de 2 personas (tope 10)`);
    assert.ok(ok.length >= 1);
    const rows = await call(`reservations?select=guests,starts_at,ends_at,status&customer_name=like.Concurrencia*&service_date=eq.${date}&status=in.(pending,confirmed)`, { token: owner, method: "GET" });
    const peak = Math.max(
      ...rows.body.map((a) => rows.body.filter((b) => new Date(b.starts_at) <= new Date(a.starts_at) && new Date(b.ends_at) > new Date(a.starts_at)).reduce((s, b) => s + b.guests, 0)),
    );
    assert.ok(peak <= 10, `pico de ${peak} comensales`);
  });

  test("la misma solicitud repetida en paralelo crea una sola reserva (idempotencia)", async () => {
    const date = nextDate(4);
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, () => request(date, "13:00", 1, 200, key)));
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.body)));
    assert.equal(new Set(results.map((r) => r.body.reservation_id)).size, 1);
    assert.equal(results.filter((r) => r.body.replayed === false).length, 1);
  });

  test("rechazar una solicitud libera el cupo para el siguiente pedido", async () => {
    const date = nextDate(4);
    const before = await request(date, "21:00", 2, 300);
    assert.equal(before.body.message, "slot_full");
    const held = await call(`reservations?select=id&customer_name=like.Concurrencia*&service_date=eq.${date}&status=eq.pending&guests=eq.2&order=created_at`, { token: owner, method: "GET" });
    const target = held.body.find(Boolean);
    const rej = await call(`reservations?id=eq.${target.id}`, { token: owner, method: "PATCH", body: { status: "rejected" } });
    assert.ok(rej.status < 300);
    const after = await request(date, "21:00", 2, 301);
    assert.equal(after.status, 200, JSON.stringify(after.body));
  });

  test("el público no puede configurar la capacidad", async () => {
    const r = await call("rpc/save_reservation_settings", { body: { p_tenant_id: BODEGON, p_settings: { capacity_guests: 999 } } });
    assert.ok(r.status === 401 || r.status === 403 || r.body?.code === "42501", JSON.stringify(r.body));
  });
});
