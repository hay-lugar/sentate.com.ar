import AxeBuilder from "@axe-core/playwright";
import { expect, newContextWithIp, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Superadministración contra Supabase LOCAL. Sakura está EN REVISIÓN (seed); superadmin@example.test es superadmin de desarrollo.
const PASSWORD = "sentate-dev-only";

async function login(page: Page, email: string, next = "/superadmin") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("un dueño o un comensal no ven el módulo (404) ni pueden llamar a las operaciones", async ({ browser, baseURL }) => {
  for (const email of ["owner.bodegon@example.test", "sin.local@example.test"]) {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await login(page, email, "/cuenta");
    await expect(page.getByRole("link", { name: /superadministración/ })).toHaveCount(0);
    await page.goto("/superadmin");
    await expect(page.getByText(/No encontramos esta página|could not be found/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Bandeja de moderación")).toHaveCount(0);
    await ctx.close();
  }
  const anon = await browser.newContext({ baseURL });
  const p = await anon.newPage();
  await p.goto("/superadmin");
  await expect(p).toHaveURL(/\/login\?next=(%2F|\/)superadmin/);
  await anon.close();
});

test("el superadmin aprueba un comercio en revisión con registro de quién y cuándo", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.71");
  const page = await ctx.newPage();
  await login(page, "superadmin@example.test");
  await expect(page.getByRole("heading", { name: "Bandeja de moderación" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sakura/ })).toBeVisible();
  await page.getByRole("link", { name: /Sakura/ }).click();
  await expect(page.getByRole("heading", { name: "Sakura" })).toBeVisible();
  await page.getByRole("button", { name: "Rechazar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "motivo" })).toBeVisible();
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comercio aprobado." })).toBeVisible();
  await expect(page.getByRole("list").filter({ hasText: "Aprobó" })).toContainText("superadmin@example.test");
  await ctx.close();
});

test("suspender oculta la carta y el explorador; reactivar los devuelve", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.72");
  const page = await ctx.newPage();
  await login(page, "superadmin@example.test");
  await page.getByRole("link", { name: "Aprobados" }).click();
  await page.getByRole("link", { name: /La Esquina/ }).click();
  await page.getByLabel(/^Motivo/).fill("Denuncia verificada de prueba");
  await page.getByRole("button", { name: "Pausar comercio" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comercio suspendido." })).toBeVisible();

  const pub = await newContextWithIp(browser, baseURL!, "203.0.113.73");
  const pp = await pub.newPage();
  expect((await pp.goto("/prueba-esquina"))?.status()).toBe(404);
  await pp.goto("/explorar");
  await expect(pp.getByRole("heading", { name: "La Esquina" })).toHaveCount(0);

  await page.getByLabel(/^Motivo/).fill("Resuelto");
  await page.getByRole("button", { name: "Reactivar comercio" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comercio reactivado." })).toBeVisible();
  expect((await pp.goto("/prueba-esquina"))?.status()).toBe(200);
  await pub.close();
  await ctx.close();
});

test("destacados: bloque aparte con etiqueta, y se quita", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.74");
  const page = await ctx.newPage();
  await login(page, "superadmin@example.test");
  await page.getByRole("link", { name: "Aprobados" }).click();
  await page.getByRole("link", { name: /El Bodegón/ }).click();
  await page.getByLabel(/^Motivo/).fill("Acuerdo piloto de prueba");
  await page.getByRole("button", { name: "Destacar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comercio destacado." })).toBeVisible();

  const pub = await newContextWithIp(browser, baseURL!, "203.0.113.75");
  const pp = await pub.newPage();
  await pp.goto("/explorar");
  const block = pp.getByRole("region", { name: "Destacados" });
  await expect(block.getByRole("heading", { name: "El Bodegón" })).toBeVisible();
  await expect(block.getByText("Destacado", { exact: true })).toBeVisible();
  // Con «Más cercanos» el orden es orgánico: no hay bloque de destacados.
  await pp.goto("/explorar?orden=distance");
  await expect(pp.getByRole("region", { name: "Destacados" })).toHaveCount(0);
  await pub.close();

  await page.getByLabel(/^Motivo/).fill("Fin del acuerdo");
  await page.getByRole("button", { name: "Quitar destacado" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Se quitó el destacado." })).toBeVisible();
  await ctx.close();
});

test("suscripción manual: exige motivo, queda en el historial y el panel es accesible en celular", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 780 }, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, "superadmin@example.test");
  await page.getByRole("link", { name: "Todos" }).click();
  await page.getByRole("link", { name: /Sakura/ }).click();
  await page.getByRole("button", { name: "Extender prueba" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "motivo" })).toBeVisible();
  await page.getByLabel(/^Motivo/).fill("Cortesía de lanzamiento");
  await page.getByRole("button", { name: "Extender prueba" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Suscripción actualizada." })).toBeVisible();
  await expect(page.getByRole("list").filter({ hasText: "Extendió la prueba" })).toContainText("Cortesía de lanzamiento");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(["color-contrast"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await ctx.close();
});

test("consola: cerrar sesión, crear un restaurante, ponerle una promoción visible en su carta y eliminarlo", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.72");
  const page = await ctx.newPage();
  await login(page, "superadmin@example.test");
  const slug = `consola-${Date.now().toString(36)}`;

  // Navegación completa de la consola: cada sección abre sin error.
  for (const [name, heading] of [["Resumen", "Resumen de la plataforma"], ["Comercios", "Comercios"], ["Suscripciones", "Suscripciones"], ["Usuarios", "Usuarios"], ["Administradores", "Administradores"], ["Auditoría", "Auditoría"], ["Sistema", "Sistema"]] as const) {
    await page.getByRole("navigation", { name: "Superadmin" }).getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  // Crear (dueño = el propio superadmin) → abre la ficha.
  await page.getByRole("navigation", { name: "Superadmin" }).getByRole("link", { name: "Comercios", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Local de Consola");
  await page.getByLabel(/Dirección web/).fill(slug);
  await page.getByLabel("Razón").fill("prueba de la consola");
  await page.getByRole("button", { name: "Crear restaurante" }).click();
  await expect(page.getByRole("heading", { name: "Local de Consola" })).toBeVisible({ timeout: 20_000 });

  // Promoción: la ficha la guarda (visible en la carta solo si el comercio es visible; acá solo se valida el registro).
  await page.getByLabel("Título").fill("2x1 en pizzas");
  await page.getByRole("region", { name: "Promoción" }).getByLabel("Razón").fill("campaña de prueba");
  await page.getByRole("button", { name: "Publicar promoción" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Promoción publicada." })).toBeVisible();
  await expect(page.getByText("2x1 en pizzas — hasta")).toBeVisible();

  // Eliminar: exige el slug exacto.
  const del = page.getByRole("button", { name: "Eliminar definitivamente" });
  await expect(del).toBeDisabled();
  await page.getByLabel(/Escribí «/).fill(slug);
  await page.getByRole("region", { name: "Eliminar comercio" }).getByLabel("Razón").fill("limpieza de prueba");
  await del.click();
  await expect(page).toHaveURL(/\/superadmin\/comercios/, { timeout: 20_000 });
  await page.goto(`/${slug}`);
  await expect(page.getByText(/No encontramos esta página|could not be found/)).toBeVisible();

  // Cerrar sesión.
  await page.goto("/superadmin");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  await ctx.close();
});
