import AxeBuilder from "@axe-core/playwright";
import { expect, newContextWithIp, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Modo oscuro de las pantallas que dependen de la base (explorador con datos, cuenta, panel real, superadmin): contraste de
// color con axe (en oscuro NO se desactiva la regla) y capturas para revisarlas a ojo (capturas/oscuro-*.png, las sube el CI).
const PASSWORD = "sentate-dev-only";
mkdirSync("capturas", { recursive: true });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function contrast(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(", ")}`);
}

const CASES: { email: string | null; path: string; name: string }[] = [
  { email: null, path: "/explorar", name: "explorar" },
  { email: null, path: "/prueba-bodegon", name: "carta" },
  { email: "sin.local@example.test", path: "/cuenta", name: "cuenta" },
  { email: "owner.bodegon@example.test", path: "/admin/prueba-bodegon/reservas/capacidad", name: "capacidad" },
  { email: "owner.bodegon@example.test", path: "/admin/prueba-bodegon/explorador", name: "ubicacion" },
  { email: "superadmin@example.test", path: "/superadmin", name: "superadmin-bandeja" },
  { email: "superadmin@example.test", path: "/superadmin/resumen", name: "superadmin-resumen" },
  { email: "superadmin@example.test", path: "/superadmin/comercios", name: "superadmin-comercios" },
];

for (const c of CASES) {
  test(`oscuro · ${c.name}: sin violaciones serias (contraste incluido)`, async ({ browser, baseURL }) => {
    const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.95", { colorScheme: "dark", viewport: { width: 390, height: 780 } });
    const page = await ctx.newPage();
    if (c.email) await login(page, c.email);
    await page.goto(c.path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `capturas/oscuro-${c.name}-390.png`, fullPage: true });
    expect(await contrast(page), c.path).toEqual([]);
    await ctx.close();
  });
}
