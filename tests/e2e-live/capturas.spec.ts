import { expect, newContextWithIp, test } from "./fixtures";
import type { BrowserContext, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Capturas de las pantallas nuevas en los anchos pedidos (360 / 390 / 768 / 1440), contra Supabase LOCAL con los fixtures
// de desarrollo. Se guardan en capturas/ (la CI las sube como artefacto) y sirven de evidencia visual. Además verifica que
// el explorador siga usable si el proveedor de mapas falla.
const PASSWORD = "sentate-dev-only";
const WIDTHS = [
  { name: "360", width: 360, height: 740 },
  { name: "390", width: 390, height: 780 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
];
mkdirSync("capturas", { recursive: true });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

const shot = (page: Page, name: string, w: string) => page.screenshot({ path: `capturas/${name}-${w}.png`, fullPage: false });

for (const vp of WIDTHS) {
  test(`capturas públicas · ${vp.name}px`, async ({ browser, baseURL }) => {
    const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.81", { viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto("/explorar");
    await expect(page.getByRole("heading", { name: "El Bodegón" })).toBeVisible();
    await page.waitForTimeout(1500);
    await shot(page, "explorar-lista", vp.name);
    if (vp.width < 1024) {
      await page.getByRole("group", { name: "Vista" }).getByRole("button", { name: "Mapa" }).click();
      await page.waitForTimeout(2500);
      await shot(page, "explorar-mapa", vp.name);
      await page.getByRole("group", { name: "Vista" }).getByRole("button", { name: "Lista" }).first().click();
      await page.getByRole("button", { name: /Filtros/ }).click();
      await page.waitForTimeout(500);
      await shot(page, "explorar-filtros", vp.name);
    }
    await page.goto("/prueba-bodegon");
    await expect(page.getByRole("group", { name: "Filtrar por dieta" })).toBeVisible();
    await shot(page, "carta-dietas", vp.name);
    await ctx.close();
  });
}

test("capturas del panel y del superadmin", async ({ browser, baseURL }) => {
  for (const [email, paths] of [
    ["owner.bodegon@example.test", [["/admin/prueba-bodegon/reservas/capacidad", "panel-capacidad"], ["/admin/prueba-bodegon/menu/precios", "panel-precios"], ["/admin/prueba-bodegon/explorador", "panel-mapa"]]],
    ["superadmin@example.test", [["/superadmin", "superadmin-bandeja"], ["/superadmin/resumen", "superadmin-resumen"], ["/superadmin/comercios", "superadmin-comercios"], ["/superadmin/suscripciones?f=all", "superadmin-suscripciones"], ["/superadmin/usuarios", "superadmin-usuarios"], ["/superadmin/administradores", "superadmin-admins"], ["/superadmin/auditoria", "superadmin-auditoria"], ["/superadmin/sistema", "superadmin-sistema"]]],
    ["sin.local@example.test", [["/cuenta", "cuenta-perfil"], ["/cuenta/favoritos", "cuenta-favoritos"]]],
  ] as const) {
    for (const vp of [WIDTHS[1], WIDTHS[3]]) {
      const ctx: BrowserContext = await browser.newContext({ baseURL, viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      await login(page, email);
      for (const [path, name] of paths) {
        await page.goto(path);
        await page.waitForTimeout(800);
        await shot(page, name, vp.name);
      }
      await ctx.close();
    }
  }
});

test("captura de la ficha del superadmin", async ({ browser, baseURL }) => {
  for (const vp of [WIDTHS[1], WIDTHS[3]]) {
    const ctx = await browser.newContext({ baseURL, viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await login(page, "superadmin@example.test");
    await page.goto("/superadmin/comercios");
    await page.getByRole("link", { name: /prueba-bodegon/ }).click();
    await expect(page.getByRole("heading", { name: "Eliminar comercio" })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `capturas/superadmin-ficha-${vp.name}.png`, fullPage: true });
    await ctx.close();
  }
});

test("si el proveedor de mapas falla, el explorador sigue usable con la lista", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.82", { viewport: { width: 1440, height: 900 } });
  await ctx.route(/tiles\.openfreemap\.org/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto("/explorar");
  await expect(page.getByRole("heading", { name: "El Bodegón" })).toBeVisible();
  await expect(page.getByText("No pudimos cargar el mapa")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Buscar comercios, platos o zonas").fill("palermo");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "La Esquina" })).toBeVisible();
  await shot(page, "explorar-sin-mapa", "1440");
  await ctx.close();
});
