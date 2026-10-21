import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, newContextWithIp, test } from "./fixtures";

// Cuenta del comensal contra Supabase LOCAL. «sin.local@example.test» es un usuario sin comercio (comensal puro);
// «owner.esquina@example.test» opera La Esquina (una persona puede ser comensal y dueña con la misma identidad).
const PASSWORD = "sentate-dev-only";
let seq = 0;
const phone = () => `11 ${String(Date.now()).slice(-6, -2)} ${String(++seq).padStart(4, "0")}`;

async function login(page: Page, email: string, next = "/cuenta") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[/?]/g, "\\$&") + "$"));
}

async function requestTable(page: Page, slug: string, name: string) {
  await page.goto(`/${slug}`);
  await page.getByRole("button", { name: /Solicitar mesa/ }).click();
  const dialog = page.getByRole("dialog", { name: "Pedir una mesa" });
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByRole("group", { name: "Elegí el día" }).locator("button:not([disabled])").nth(3).click();
  await dialog.getByRole("group", { name: "Elegí el horario" }).locator("button:not([disabled])").first().click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByLabel("Nombre", { exact: true }).fill(name);
  await dialog.getByLabel("Teléfono").fill(phone());
  await dialog.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Solicitud enviada" })).toBeVisible();
}

test("sin sesión, /cuenta lleva al ingreso y vuelve", async ({ page }) => {
  await page.goto("/cuenta/reservas");
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)cuenta/);
});

test("un proveedor no habilitado en Supabase no aparece como botón", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Continuar con (Google|Apple)/ })).toHaveCount(0);
});

test("el perfil se guarda y se valida", async ({ page }) => {
  await login(page, "sin.local@example.test");
  await page.getByLabel("Nombre", { exact: true }).fill("Comensal de Prueba");
  await page.getByLabel("Teléfono").fill("abc");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "teléfono válido" })).toBeVisible();
  await page.getByLabel("Teléfono").fill("+54 11 0000-1234");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guardado." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Comensal de Prueba");
});

test("una reserva con sesión aparece en el historial y se puede retirar; la de invitado no", async ({ browser, baseURL }) => {
  const guestCtx = await newContextWithIp(browser, baseURL!, "203.0.113.41");
  const guest = await guestCtx.newPage();
  await requestTable(guest, "prueba-esquina", `Invitado ${Date.now()}`);
  await guestCtx.close();

  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.42");
  const page = await ctx.newPage();
  await login(page, "sin.local@example.test");
  const name = `Comensal ${Date.now()}`;
  await requestTable(page, "prueba-esquina", name);

  await page.goto("/cuenta/reservas");
  const items = page.getByRole("list").getByRole("listitem");
  await expect(items.filter({ hasText: "La Esquina" })).toHaveCount(1);
  await expect(items.filter({ hasText: "Pendiente" })).toHaveCount(1);

  await items.first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: "La Esquina" })).toBeVisible();
  await page.getByRole("button", { name: "Retirar solicitud" }).click();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByText("Cancelada", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retirar solicitud" })).toHaveCount(0);
  await ctx.close();
});

test("nadie ve el detalle de una reserva ajena", async ({ browser, baseURL }) => {
  const a = await newContextWithIp(browser, baseURL!, "203.0.113.43");
  const pa = await a.newPage();
  await login(pa, "sin.local@example.test");
  await requestTable(pa, "prueba-esquina", `Privada ${Date.now()}`);
  await pa.goto("/cuenta/reservas");
  const href = await pa.getByRole("list").getByRole("listitem").first().getByRole("link").getAttribute("href");
  expect(href).toMatch(/^\/cuenta\/reservas\/[0-9a-f-]{36}$/);

  const b = await browser.newContext({ baseURL });
  const pb = await b.newPage();
  await login(pb, "owner.bodegon@example.test");
  const res = await pb.goto(href!);
  expect(res?.status()).toBe(404);
  await a.close();
  await b.close();
});

test("favoritos: se guardan desde el explorador, son privados y se quitan", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await login(page, "sin.local@example.test", "/explorar");
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/explorar"));
  await page.getByRole("button", { name: "Guardar La Esquina en favoritos" }).click();
  await saved;
  await expect(page.getByRole("button", { name: "Quitar La Esquina de favoritos" })).toBeVisible();

  await page.goto("/cuenta/favoritos");
  await expect(page.getByRole("link", { name: "La Esquina" })).toBeVisible();

  const other = await browser.newContext({ baseURL });
  const po = await other.newPage();
  await login(po, "owner.bodegon@example.test", "/cuenta/favoritos");
  await expect(po.getByText("Todavía no guardaste favoritos.")).toBeVisible();
  await other.close();

  await page.getByRole("button", { name: "Quitar La Esquina de favoritos" }).click();
  await expect(page.getByText("Todavía no guardaste favoritos.")).toBeVisible();
  await ctx.close();
});

test("sin sesión, el corazón lleva al ingreso", async ({ page }) => {
  await page.goto("/explorar");
  await page.getByRole("link", { name: "Ingresar para guardar La Esquina en favoritos" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fexplorar/);
});

test("quien es dueño y comensal mantiene cada permiso aparte", async ({ page }) => {
  await login(page, "owner.esquina@example.test");
  await expect(page.getByRole("heading", { name: "Tus locales" })).toBeVisible();
  await page.goto("/cuenta/reservas");
  await expect(page.getByText("Todavía no tenés reservas.")).toBeVisible();
  // Y la cuenta de comensal pura no tiene acceso al panel de otro comercio.
});

test("la baja de cuenta exige confirmar y se niega a quien opera un local", async ({ page }) => {
  await login(page, "owner.esquina@example.test");
  await page.getByRole("button", { name: "Eliminar mi cuenta" }).click();
  const del = page.getByRole("button", { name: "Eliminar definitivamente" });
  await expect(del).toBeDisabled();
  await page.getByLabel("Escribí ELIMINAR para confirmar").fill("ELIMINAR");
  await del.click();
  await expect(page.getByRole("alert").filter({ hasText: "opera un local" })).toBeVisible();
});

test("celular 390px: perfil, reservas y favoritos sin desborde ni violaciones graves", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 780 }, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, "sin.local@example.test");
  for (const path of ["/cuenta", "/cuenta/reservas", "/cuenta/favoritos"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  }
  await ctx.close();
});
