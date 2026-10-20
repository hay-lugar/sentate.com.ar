// Realtime REAL (local): canal privado por comercio autorizado por RLS de realtime.messages.
// Requiere `supabase start` (con realtime) + `supabase db reset`.
// Ejecutar: node --test supabase/tests/api/realtime.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const API = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
// Clave publicable del stack LOCAL (valor por defecto de `supabase start`, no es un secreto).
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const BODEGON = "11111111-1111-4111-8111-111111111111";
const ESQUINA = "22222222-2222-4222-8222-222222222222";
const topic = (tenantId) => `tenant:${tenantId}:reservations`;

const clients = [];
async function signedIn(email) {
  const client = createClient(API, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: "sentate-dev-only" });
  assert.ifError(error);
  await client.realtime.setAuth();
  clients.push(client);
  return client;
}

/** Se suscribe y resuelve con el estado final (SUBSCRIBED o CHANNEL_ERROR) y los eventos recibidos. */
function subscribe(client, name) {
  const events = [];
  const channel = client.channel(name, { config: { private: true } });
  channel.on("broadcast", { event: "reservation_changed" }, (msg) => events.push(msg.payload));
  const status = new Promise((resolve) => {
    channel.subscribe((s, err) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") resolve({ status: s, err });
    });
  });
  return { channel, events, status };
}

const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

const nextDate = (weekday, minDays = 2) => {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  for (let i = minDays; i < minDays + 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d.getDay() === weekday) return d.toLocaleDateString("en-CA");
  }
};

after(async () => {
  for (const c of clients) await c.removeAllChannels();
});

describe("Realtime de reservas", () => {
  test("el dueño recibe la solicitud nueva de SU comercio, sin datos personales; otro dueño no puede suscribirse", async () => {
    const owner = await signedIn("owner.bodegon@example.test");
    const other = await signedIn("owner.esquina@example.test");

    const mine = subscribe(owner, topic(BODEGON));
    const foreign = subscribe(other, topic(BODEGON));
    assert.equal((await mine.status).status, "SUBSCRIBED");
    assert.equal((await foreign.status).status, "CHANNEL_ERROR", "un dueño ajeno no se puede unir al canal privado");

    const anon = createClient(API, KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.rpc("request_reservation", {
      p_tenant_id: BODEGON,
      p_service_date: nextDate(3),
      p_time: "21:00",
      p_guests: 2,
      p_customer_name: "Realtime Test",
      p_customer_phone: "11 4000 1234",
      p_notes: "",
      p_idempotency_key: randomUUID(),
    });
    assert.ifError(error);

    assert.ok(await waitFor(() => mine.events.some((e) => e.id === data.reservation_id)), "llegó el evento al dueño");
    const ev = mine.events.find((e) => e.id === data.reservation_id);
    assert.equal(ev.status, "pending");
    assert.equal(ev.op, "insert");
    assert.ok(ev.version, "incluye versión para deduplicar");
    assert.equal("customer_name" in ev || "customer_phone" in ev, false, "sin nombre ni teléfono en el evento");
    assert.equal(foreign.events.length, 0);
  });

  test("un dueño suscripto a su canal no recibe eventos de otro comercio", async () => {
    const esquina = await signedIn("owner.esquina@example.test");
    const own = subscribe(esquina, topic(ESQUINA));
    assert.equal((await own.status).status, "SUBSCRIBED");

    const bodegon = await signedIn("owner.bodegon@example.test");
    const { data: pending } = await bodegon
      .from("reservations")
      .select("id")
      .eq("tenant_id", BODEGON)
      .eq("status", "pending")
      .limit(1)
      .single();
    const { error } = await bodegon.from("reservations").update({ status: "confirmed" }).eq("id", pending.id).select("id");
    assert.ifError(error);

    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(own.events.length, 0, "Esquina no recibió el cambio de Bodegón");
  });

  test("sin sesión no se puede unir a un canal privado de reservas", async () => {
    const anon = createClient(API, KEY, { auth: { persistSession: false } });
    clients.push(anon);
    const sub = subscribe(anon, topic(BODEGON));
    assert.notEqual((await sub.status).status, "SUBSCRIBED");
  });
});
