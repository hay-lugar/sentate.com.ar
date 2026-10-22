import { describe, expect, it } from "vitest";
import { dispatchOnce, type Claimed } from "@/lib/notifications/dispatch";
import { notificationsAvailable, readProviderConfig, resendProvider } from "@/lib/notifications/provider";
import { renderNotification, type NotificationPayload } from "@/lib/notifications/templates";

const payload: NotificationPayload = { tenant_name: "El Bodegón", tenant_phone: "+54 11 0000-0101", timezone: "America/Argentina/Buenos_Aires", starts_at: "2026-11-07T00:30:00Z", guests: 4, first_name: "Ana" };

describe("plantillas", () => {
  it("«recibida» aclara que NO es una reserva confirmada", () => {
    const m = renderNotification("reservation_received", payload, "{Sin Nombre}");
    expect(m.text).toMatch(/NO es una reserva confirmada/);
    expect(m.subject).not.toMatch(/confirmada/);
  });
  it("«confirmada» usa la hora del local y no incluye datos personales", () => {
    const m = renderNotification("reservation_confirmed", payload, "{Sin Nombre}");
    expect(m.text).toContain("21:30 h");
    expect(m.text).not.toMatch(/@|\b11 4\d{3}\b/);
  });
  it("escapa HTML de los datos del comercio", () => {
    const m = renderNotification("reservation_rejected", { ...payload, tenant_name: "<b>X</b>" }, "{Sin Nombre}");
    expect(m.html).not.toContain("<b>X</b>");
  });
});

describe("proveedores", () => {
  it("sin configuración no hay envíos ni se ofrece el email al comensal", () => {
    expect(readProviderConfig({}).enabled).toBe(false);
    expect(notificationsAvailable({})).toBe(false);
    expect(readProviderConfig({ NOTIFICATIONS_PROVIDER: "resend" }).enabled).toBe(false);
    expect(notificationsAvailable({ NOTIFICATIONS_PROVIDER: "resend", RESEND_API_KEY: "k", NOTIFICATIONS_FROM: "a@b.c" })).toBe(false); // falta el secreto del despachador
    expect(notificationsAvailable({ NOTIFICATIONS_PROVIDER: "resend", RESEND_API_KEY: "k", NOTIFICATIONS_FROM: "a@b.c", NOTIFICATIONS_WORKER_SECRET: "s" })).toBe(true);
  });
  it("clasifica los errores: 5xx y red se reintentan; 4xx es definitivo; sin id no es éxito", async () => {
    const mk = (f: typeof fetch) => resendProvider("k", "from@x.test", f);
    const msg = { to: "a@b.c", subject: "s", text: "t", html: "h", idempotencyKey: "k1" };
    expect(await mk((async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 })) as unknown as typeof fetch).send(msg)).toEqual({ ok: true, providerId: "m1" });
    expect(await mk((async () => new Response("", { status: 503 })) as unknown as typeof fetch).send(msg)).toMatchObject({ ok: false, retryable: true });
    expect(await mk((async () => new Response("", { status: 422 })) as unknown as typeof fetch).send(msg)).toMatchObject({ ok: false, retryable: false });
    expect(await mk((async () => new Response("{}", { status: 200 })) as unknown as typeof fetch).send(msg)).toMatchObject({ ok: false, retryable: true });
    expect(await mk((async () => { throw new Error("x"); }) as unknown as typeof fetch).send(msg)).toMatchObject({ ok: false, retryable: true });
  });
});

describe("despachador", () => {
  it("registra el resultado real de cada aviso", async () => {
    const rows: Claimed[] = [1, 2, 3].map((n) => ({ id: `id${n}`, kind: "reservation_confirmed", recipient: `u${n}@x.test`, payload, attempts: 1 }));
    const done: Record<string, unknown> = {};
    const summary = await dispatchOnce({
      brandName: "B",
      claim: async () => rows,
      complete: async (id, r) => void (done[id] = r),
      provider: { name: "fake", send: async (m) => (m.to.startsWith("u1") ? { ok: true, providerId: "p1" } : m.to.startsWith("u2") ? { ok: false, retryable: true, error: "timeout" } : { ok: false, retryable: false, error: "http_422" }) },
    });
    expect(summary).toEqual({ claimed: 3, sent: 1, retry: 1, failed: 1 });
    expect(done.id1).toMatchObject({ ok: true, providerId: "p1" });
    expect(done.id2).toMatchObject({ ok: false, retryable: true });
    expect(done.id3).toMatchObject({ ok: false, retryable: false });
  });
});
