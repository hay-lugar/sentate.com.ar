import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Locator, Page } from "@playwright/test";
import { expect, newContextWithIp, test } from "./fixtures";

// Reservas del piloto contra Supabase LOCAL: texto honesto para el comensal, estados y contacto manual en el panel,
// límite por conexión y acceso público. Cada grupo usa su propia IP de cliente (ver fixtures.ts) para que el cupo de
// unas pruebas no afecte a las otras.

const PASSWORD = "sentate-dev-only";
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const BASE = `http://localhost:${process.env.E2E_LIVE_PORT ?? 3300}`;

let seq = 0;
const uniquePhone = () => `11 ${String(Date.now()).slice(-8, -4)} ${String(++seq).padStart(4, "0")}`;

/** Pide una mesa desde la carta pública. Devuelve el diálogo con el resultado (éxito o error). */
async function submitRequest(page: Page, slug: string, who: { name: string; phone: string }) {
  await page.goto(`/${slug}`);
  await page.getByRole("button", { name: /Reservar mesa/ }).click();
  const dialog = page.getByRole("dialog", { name: "Pedir una mesa" });
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByRole("group", { name: "Elegí el día" }).locator("button:not([disabled])").nth(2).click();
  await dialog.getByRole("group", { name: "Elegí el horario" }).locator("button:not([disabled])").first().click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByLabel("Nombre").fill(who.name);
  await dialog.getByLabel("Teléfono").fill(who.phone);
  await dialog.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  return dialog;
}

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/.]/g, "\\$&")}$`));
}

const sent = (dialog: Locator) => expect(dialog.getByRole("heading", { name: "Solicitud enviada" })).toBeVisible();

test.describe("lo que ve el comensal", () => {
  test.use({ clientIp: "203.0.113.20" });

  test("el resultado explica cómo se entera de la respuesta y no promete ni inventa envíos", async ({ page }) => {
    const dialog = await submitRequest(page, "prueba-bodegon", { name: `Comensal ${Date.now()}`, phone: uniquePhone() });

    await sent(dialog);
    await expect(dialog.getByText("Solicitud pendiente")).toBeVisible();
    await expect(dialog.getByText("Todavía no es una reserva")).toBeVisible();
    await expect(dialog.getByText(/no hay una mesa guardada para vos hasta que el local la confirme/)).toBeVisible();

    // Cómo se entera: el local lo contacta por su cuenta; Sentate no notifica todavía.
    await expect(dialog.getByText("¿Cómo te enterás de la respuesta?")).toBeVisible();
    await expect(dialog.getByText(/se comunica con vos al teléfono que dejaste \(llamada o WhatsApp\)/)).toBeVisible();
    await expect(dialog.getByText("Sentate todavía no envía mensajes ni emails automáticos")).toBeVisible();
    await expect(dialog.getByText(/no hay una pantalla para seguir el estado/)).toBeVisible();

    // Y puede llamar al local si no tiene novedades (el teléfono público de la carta).
    await expect(dialog.getByRole("link", { name: "+54 11 0000-0101" })).toHaveAttribute("href", "tel:+541100000101");

    // Nada que afirme un envío o una confirmación que no ocurrió.
    await expect(dialog).not.toContainText(/te enviamos|te mandamos|te enviaremos|reserva confirmada|mesa reservada|confirmamos tu/i);
  });

  test("el aviso del formulario aclara que el local responde por su cuenta", async ({ page }) => {
    await page.goto("/prueba-bodegon");
    // El botón de la carta no promete: pide y dice que el local revisa.
    await expect(page.getByText("Solicitá tu mesa · el local la revisa")).toBeVisible();
    await page.getByRole("button", { name: /Reservar mesa/ }).click();
    const dialog = page.getByRole("dialog", { name: "Pedir una mesa" });
    await dialog.getByRole("button", { name: "Continuar" }).click();
    await dialog.getByRole("group", { name: "Elegí el día" }).locator("button:not([disabled])").nth(2).click();
    await dialog.getByRole("group", { name: "Elegí el horario" }).locator("button:not([disabled])").first().click();
    await dialog.getByRole("button", { name: "Continuar" }).click();
    await expect(dialog.getByText(/Sentate no envía mensajes automáticos/)).toBeVisible();
  });
});

test.describe("panel del dueño: estados y contacto manual", () => {
  test.use({ clientIp: "203.0.113.30" });

  test("muestra pendiente, confirmada, rechazada y cancelada, y arma enlaces de WhatsApp sin enviar nada", async ({ page, browser }) => {
    test.setTimeout(150_000);
    const stamp = Date.now();
    const who = {
      confirmed: { name: `Ana Confirmada ${stamp}`, phone: uniquePhone() },
      rejected: { name: `Beto Rechazado ${stamp}`, phone: uniquePhone() },
      pending: { name: `Carla Pendiente ${stamp}`, phone: uniquePhone() },
      ambiguous: { name: `Darío Ambiguo ${stamp}`, phone: "11 15 0000 0000" }, // con el 15 de los celulares: no se adivina
    };
    for (const w of Object.values(who)) await sent(await submitRequest(page, "prueba-bodegon", w));

    const ownerCtx = await newContextWithIp(browser, BASE, null);
    const owner = await ownerCtx.newPage();
    await login(owner, "owner.bodegon@example.test", "/admin/prueba-bodegon/reservas");
    await owner.getByRole("button", { name: /^Todas/ }).click();
    const row = (name: string) => owner.getByRole("listitem").filter({ hasText: name });

    // Una nota que no es un mensaje enviado: el enlace solo abre WhatsApp.
    await expect(owner.getByText(/lo enviás vos\. Sentate no manda mensajes a los comensales ni verifica el teléfono/)).toBeVisible();

    // PENDIENTE: etiqueta visible y mensaje que no la da por confirmada.
    const pending = row(who.pending.name);
    await expect(pending.getByText("Pendiente", { exact: true })).toBeVisible();
    const link = pending.getByRole("link", { name: new RegExp(`WhatsApp con ${who.pending.name}`) });
    const href = (await link.getAttribute("href"))!;
    expect(href).toMatch(/^https:\/\/wa\.me\/549\d{10}\?text=/);
    const text = new URL(href).searchParams.get("text")!;
    expect(text).toContain("Hola Carla, te escribimos de El Bodegón.");
    expect(text).toContain("La estamos revisando");
    expect(text).not.toMatch(/confirmada|te esperamos/i);
    await expect(link).toHaveAttribute("target", "_blank");
    expect(await link.getAttribute("rel")).toContain("noopener");
    await expect(pending.getByText(/^\+54 9 \d{10} · asumimos Argentina$/)).toBeVisible(); // el dueño ve a qué número escribe
    await expect(pending.getByRole("link", { name: /^Llamar/ })).toHaveAttribute("href", /^tel:\d+$/);

    // NÚMERO AMBIGUO: sin enlace de WhatsApp (no se adivina), pero sí el teléfono y Llamar.
    const ambiguous = row(who.ambiguous.name);
    await expect(ambiguous.getByRole("link", { name: /WhatsApp/ })).toHaveCount(0);
    await expect(ambiguous.getByText("Sin enlace de WhatsApp: el número no trae el país o es ambiguo.")).toBeVisible();
    await expect(ambiguous.getByRole("link", { name: /^Llamar/ })).toBeVisible();

    // CONFIRMADA
    await row(who.confirmed.name).getByRole("button", { name: `Confirmar reserva de ${who.confirmed.name}` }).click();
    await expect(row(who.confirmed.name).getByText("Reserva confirmada")).toBeVisible();
    const confirmedHref = (await row(who.confirmed.name).getByRole("link", { name: /WhatsApp con/ }).getAttribute("href"))!;
    expect(new URL(confirmedHref).searchParams.get("text")).toContain("está confirmada");

    // RECHAZADA
    await row(who.rejected.name).getByRole("button", { name: `Rechazar solicitud de ${who.rejected.name}` }).click();
    await expect(row(who.rejected.name).getByText("Solicitud rechazada")).toBeVisible();
    const rejectedHref = (await row(who.rejected.name).getByRole("link", { name: /WhatsApp con/ }).getAttribute("href"))!;
    expect(new URL(rejectedHref).searchParams.get("text")).toContain("No podemos confirmar");

    // CANCELADA: el panel no tiene un botón para cancelar; se fuerza con la sesión del dueño por la API y llega en vivo.
    const api = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await api.auth.signInWithPassword({ email: "owner.bodegon@example.test", password: PASSWORD })).error).toBeNull();
    const cancel = await api.from("reservations").update({ status: "cancelled" }).eq("customer_name", who.confirmed.name).eq("status", "confirmed").select("id");
    expect(cancel.error).toBeNull();
    expect(cancel.data).toHaveLength(1);
    await expect(row(who.confirmed.name).getByText("Cancelada", { exact: true })).toBeVisible({ timeout: 15_000 });
    const cancelledHref = (await row(who.confirmed.name).getByRole("link", { name: /WhatsApp con/ }).getAttribute("href"))!;
    expect(new URL(cancelledHref).searchParams.get("text")).toContain("figura como cancelada");

    await ownerCtx.close();
  });
});

test.describe("límite por conexión: cupo", () => {
  test.use({ clientIp: "203.0.113.77" });

  test("12 solicitudes pasan, la 13 se bloquea con un mensaje claro, y otra conexión sigue pudiendo", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();
    for (let i = 1; i <= 12; i++) await sent(await submitRequest(page, "prueba-esquina", { name: `Cupo ${i} ${stamp}`, phone: uniquePhone() }));

    const blocked = await submitRequest(page, "prueba-esquina", { name: `Cupo 13 ${stamp}`, phone: uniquePhone() });
    await expect(blocked.getByRole("heading", { name: "No pudimos enviar la solicitud" })).toBeVisible();
    await expect(blocked).toContainText("Hiciste muchas solicitudes en poco tiempo desde esta conexión");
    await expect(blocked.getByRole("button", { name: "Reintentar" })).toBeVisible();

    // Otra conexión tiene su propio cupo.
    const otherCtx = await newContextWithIp(browser, BASE, "203.0.113.78");
    const other = await otherCtx.newPage();
    await sent(await submitRequest(other, "prueba-esquina", { name: `Otra conexión ${stamp}`, phone: uniquePhone() }));
    await otherCtx.close();
  });

  test("sin el header de IP el formulario falla cerrado y manda a llamar al local", async ({ browser }) => {
    const ctx = await newContextWithIp(browser, BASE, null);
    const page = await ctx.newPage();
    const dialog = await submitRequest(page, "prueba-bodegon", { name: `Sin IP ${Date.now()}`, phone: uniquePhone() });
    await expect(dialog.getByRole("heading", { name: "No pudimos enviar la solicitud" })).toBeVisible();
    await expect(dialog).toContainText("Por ahora no podemos recibir solicitudes desde la web");
    await expect(dialog).toContainText("llamá al local");
    await ctx.close();
  });
});

test.describe("acceso público", () => {
  test.use({ clientIp: "203.0.113.40" });

  test("el público no puede leer reservas ni datos personales por ninguna vía", async ({ page, request }) => {
    const name = `Privado ${Date.now()}`;
    const phone = uniquePhone();
    await sent(await submitRequest(page, "prueba-bodegon", { name, phone }));

    const anon = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    const read = await anon.from("reservations").select("*");
    expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
    expect((await anon.from("rate_limit_hits").select("*")).error).not.toBeNull(); // el esquema privado no se expone

    // La clave del cupo solo acepta un HMAC: una IP en claro o texto libre se rechaza.
    expect((await anon.rpc("consume_reservation_ip_budget", { p_key: "203.0.113.10" })).error).not.toBeNull();

    // Ni la carta pública ni sus datos de página incluyen a quien pidió la mesa.
    const html = await (await request.get("/prueba-bodegon")).text();
    expect(html).not.toContain(name);
    expect(html).not.toContain(phone);
    expect(html).not.toContain(phone.replace(/\s/g, ""));
  });
});

test.describe("panel de reservas en el celular", () => {
  for (const width of [360, 390]) {
    test(`${width}px: sin desborde, contactos tocables y sin violaciones serias de accesibilidad`, async ({ browser }) => {
      const ctx = await newContextWithIp(browser, BASE, null, { viewport: { width, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await login(page, "owner.bodegon@example.test", "/admin/prueba-bodegon/reservas");
      await page.getByRole("button", { name: /^Todas/ }).click();
      await expect(page.getByRole("link", { name: /^WhatsApp con/ }).first()).toBeVisible();

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const name of [/^WhatsApp con/, /^Llamar/]) {
        const box = await page.getByRole("link", { name }).first().boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }

      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === "finished" || a.playState === "idle"));
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      await ctx.close();
    });
  }
});
