import AxeBuilder from "@axe-core/playwright";
import { expect, newContextWithIp, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Etapa F contra Supabase LOCAL (El Bodegón, owner.bodegon@example.test).
const PASSWORD = "sentate-dev-only";

async function ownerLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner.bodegon@example.test");
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function bulk(page: Page, amount: string) {
  await page.goto("/admin/prueba-bodegon/menu/precios");
  await page.getByLabel("Tipo").selectOption("amount");
  await page.getByLabel(/Monto en \$/).fill(amount);
  await page.getByRole("checkbox", { name: /^Entradas$/ }).check();
  await expect(page.getByRole("listitem").filter({ hasText: "Provoleta a la parrilla" })).toContainText("→");
  await page.getByRole("button", { name: /Revisar y aplicar/ }).click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Se actualizaron/ })).toBeVisible();
}

test("etiquetas dietarias en la carta: filtro, aviso de que son declaradas y sin inferir al local", async ({ page }) => {
  await page.goto("/prueba-bodegon");
  const group = page.getByRole("group", { name: "Filtrar por dieta" });
  await expect(group.getByRole("button", { name: "Vegetariano" })).toBeVisible();
  await expect(group.getByRole("button", { name: "Apto celíacos" })).toBeVisible();
  await group.getByRole("button", { name: "Apto celíacos" }).click();
  await expect(page.getByText("no son una certificación")).toBeVisible();
  await expect(page.getByText("Ojo de bife 400g")).toBeVisible();
  await expect(page.getByText("Provoleta a la parrilla")).toHaveCount(0);
  await group.getByRole("button", { name: "Apto celíacos" }).click();
  await expect(page.getByText("Provoleta a la parrilla")).toBeVisible();
});

test("cambio masivo de precios: vista previa, todo o nada y precio público actualizado", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.61");
  const page = await ctx.newPage();
  await ownerLogin(page);
  await bulk(page, "100");
  const pub = await ctx.newPage();
  await pub.goto("/prueba-bodegon");
  await expect(pub.getByText(/9\.900/).first()).toBeVisible();

  // Un conflicto de versión (otra sesión cambió el precio) no aplica nada.
  await page.goto("/admin/prueba-bodegon/menu/precios");
  await page.getByLabel("Tipo").selectOption("amount");
  await page.getByLabel(/Monto en \$/).fill("-100");
  await page.getByRole("checkbox", { name: /^Entradas$/ }).check();
  const other = await ctx.newPage();
  await bulk(other, "1"); // cambia las versiones de Entradas
  await page.getByRole("button", { name: /Revisar y aplicar/ }).click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No se aplicó ningún cambio" })).toBeVisible();

  // Se deja El Bodegón como estaba: +100 y +1 → -101.
  await bulk(page, "-101");
  await pub.goto("/prueba-bodegon");
  await expect(pub.getByText(/9\.800/).first()).toBeVisible();
  await ctx.close();
});

test("panel de reservas: sonido opcional apagado por defecto y accesibilidad en celular", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 780 }, hasTouch: true });
  const page = await ctx.newPage();
  await ownerLogin(page);
  await page.goto("/admin/prueba-bodegon/reservas");
  const toggle = page.getByRole("button", { name: /Sonido de solicitudes/ });
  await expect(toggle).toHaveText(/desactivado/);
  await toggle.click();
  await expect(toggle).toHaveText(/activado/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(["color-contrast"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await ctx.close();
});
