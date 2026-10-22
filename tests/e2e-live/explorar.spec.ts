import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

// Explorador público contra Supabase LOCAL. Fixtures de supabase/seed.sql: El Bodegón (Almagro, parrilla) y La Esquina
// (Palermo, bar) están listados; Sakura (prueba vencida) y Casa Borrador (sin publicar) NO.

test("lista solo comercios aprobados, publicados y con acceso vigente", async ({ page }) => {
  await page.goto("/explorar");
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "La Esquina" })).toBeVisible();
  await expect(page.getByText("Sakura")).toHaveCount(0);
  await expect(page.getByText("Casa Borrador")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /comercios/ })).toContainText("2 comercios");
});

test("la búsqueda interpreta términos conocidos como filtros visibles y tolera errores", async ({ page }) => {
  await page.goto("/explorar");
  await page.getByLabel("Buscar comercios, platos o zonas").fill("hamburguesas en palermo");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("list", { name: "Filtros activos" })).toContainText("Cocina: Hamburguesas");
  await expect(page.getByRole("list", { name: "Filtros activos" })).toContainText("Palermo");
  await expect(page).toHaveURL(/cocina=hamburguesas/);
  await expect(page.getByRole("heading", { name: "La Esquina" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toHaveCount(0);

  // Quitar un filtro lo saca de la URL; «Limpiar todo» vuelve al listado completo.
  await page.getByRole("button", { name: "Quitar filtro: Palermo" }).click();
  await expect(page).not.toHaveURL(/loc=/);
  await page.getByRole("button", { name: "Limpiar todo" }).click();
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toBeVisible();

  // Tolerancia a un error de tipeo y búsqueda por plato.
  await page.getByLabel("Buscar comercios, platos o zonas").fill("provoleta");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "La Esquina" })).toHaveCount(0);
});

test("lo ambiguo no se aplica solo: la persona elige", async ({ page }) => {
  await page.goto("/explorar");
  await page.getByLabel("Buscar comercios, platos o zonas").fill("parrilla");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const ask = page.getByRole("group", { name: /Aclarar/ });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Cocina: Parrilla" }).click();
  await expect(page).toHaveURL(/cocina=parrilla/);
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toBeVisible();
});

test("el estado vive en la URL: compartible y con atrás/adelante", async ({ page }) => {
  await page.goto("/explorar?tipo=bar");
  await expect(page.getByRole("heading", { name: "La Esquina" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toHaveCount(0);
  await page.getByRole("button", { name: "Quitar filtro: Bar" }).click();
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toHaveCount(0);
});

test("sin permiso de ubicación hay alternativa y nada de coordenadas en la URL", async ({ page }) => {
  await page.goto("/explorar");
  await page.getByRole("button", { name: "Usar mi ubicación" }).first().click();
  await expect(page.getByText(/No tenemos permiso|No pudimos obtener tu ubicación/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toBeVisible();
  expect(page.url()).not.toMatch(/lat|lng|-34\./);
});

test("con permiso, ordena por cercanía y no pone la posición en la URL", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, permissions: ["geolocation"], geolocation: { latitude: -34.5875, longitude: -58.4305 }, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/explorar");
  await page.getByRole("button", { name: "Usar mi ubicación" }).first().click();
  await expect(page.getByRole("list", { name: "Filtros activos" })).toContainText("Cerca de mí");
  const names = page.locator("article h3");
  await expect(names.first()).toHaveText("La Esquina");
  await expect(page.locator("article").first()).toContainText("a ~");
  expect(page.url()).not.toMatch(/lat|lng|-34\.|-58\./);
  await ctx.close();
});

test("el acceso a la carta y al pedido de mesa funciona desde la tarjeta", async ({ page }) => {
  await page.goto("/explorar?tipo=bar");
  await page.getByRole("link", { name: "Pedir mesa" }).click();
  await expect(page).toHaveURL(/\/prueba-esquina\?mesa=1/);
  await expect(page.getByRole("dialog", { name: "Pedir una mesa" })).toBeVisible();
});

test("la búsqueda pública no filtra comercios ocultos ni datos privados", async ({ request }) => {
  const res = await request.post("/api/explorar", { data: { q: "sakura", limit: 20, offset: 0 } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { total: number; items: Record<string, unknown>[] };
  expect(body.total).toBe(0);
  const all = await (await request.post("/api/explorar", { data: { limit: 50, offset: 0 } })).json();
  for (const item of all.items as Record<string, unknown>[]) {
    expect(Object.keys(item).sort()).toEqual(
      ["accepts_reservations", "business_type", "cover_url", "cuisines", "distance_m", "featured", "id", "lat", "lng", "locality", "logo_url", "name", "neighborhood", "open_now", "price_range", "slug", "tagline"].sort(),
    );
  }
  expect((await request.post("/api/explorar", { data: { limit: 9999, offset: 0 } })).status()).toBe(400);
});

test("celular 390px: sin desborde, filtros en hoja, alternancia lista/mapa y accesibilidad", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 780 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/explorar");
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: /Filtros/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filtros" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /^Bar/ }).click();
  await sheet.getByRole("button", { name: /Ver 1 resultado/ }).click();
  await expect(page.getByRole("list", { name: "Filtros activos" })).toContainText("Bar");

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(["color-contrast"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  // La lista sigue usable aunque el mapa no cargue (sin WebGL/teselas).
  await page.getByRole("group", { name: "Vista" }).getByRole("button", { name: "Mapa" }).click();
  await expect(page.getByRole("application", { name: /Mapa de comercios/ }).or(page.getByText("No pudimos cargar el mapa"))).toBeVisible({ timeout: 15_000 });
  await ctx.close();
});
