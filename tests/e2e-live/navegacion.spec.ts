import { expect, newContextWithIp, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Paso 3 y 4 del plan: nadie queda atrapado. Un comensal (cuenta sin locales) NUNCA es obligado a crear un local; el alta de un
// local es una elección explícita; y todas las pantallas del camino tienen salida.
const PASSWORD = "sentate-dev-only";

async function login(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("un comensal sin locales ingresa a su cuenta, no al alta de un local", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.101");
  const page = await ctx.newPage();
  await login(page, "sin.local@example.test");
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible();
  // Y puede elegir, si quiere, publicar un local: es opcional.
  await expect(page.getByRole("link", { name: "Publicar mi local" })).toBeVisible();
  await ctx.close();
});

test("/admin sin locales explica y deja elegir (sin redirigir al alta), con todas las salidas", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.102");
  const page = await ctx.newPage();
  await login(page, "sin.local@example.test", "/admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Todavía no tenés un local" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Crear mi local" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ir a mi cuenta" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explorar locales" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();

  // El alta existe, pero con salida visible.
  await page.getByRole("link", { name: "Crear mi local" }).click();
  await expect(page).toHaveURL(/\/registro\/local$/);
  await expect(page.getByRole("link", { name: "Ahora no: ir a mi cuenta" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explorar locales" })).toBeVisible();
  await page.getByRole("link", { name: "Ahora no: ir a mi cuenta" }).click();
  await expect(page).toHaveURL(/\/cuenta$/);

  // Cerrar sesión desde la pantalla vacía.
  await page.goto("/admin");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/cuenta");
  await expect(page).toHaveURL(/\/login\?next=/); // sin sesión no hay datos privados, ni con «Atrás»
  await ctx.close();
});

test("un dueño ingresa directo a su panel y «Sumar otro local» ofrece volver", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.103");
  const page = await ctx.newPage();
  await login(page, "owner.bodegon@example.test");
  await expect(page).toHaveURL(/\/admin\/prueba-bodegon$/);
  await page.goto("/registro/local");
  await expect(page.getByRole("heading", { name: "Sumar otro local" })).toBeVisible();
  await page.getByRole("link", { name: "Volver a mi panel" }).click();
  await expect(page).toHaveURL(/\/admin\/prueba-bodegon$/);
  await ctx.close();
});

test("el registro respeta la intención elegida y quien ya tiene sesión no es llevado al alta sin pedirlo", async ({ browser, baseURL }) => {
  const anon = await newContextWithIp(browser, baseURL!, "203.0.113.104");
  const p = await anon.newPage();
  await p.goto("/registro");
  await expect(p.getByRole("radio", { name: /Quiero descubrir locales/ })).toBeChecked();
  await p.goto("/registro?intencion=local");
  await expect(p.getByRole("radio", { name: /Quiero publicar mi local/ })).toBeChecked();
  await anon.close();

  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.105");
  const page = await ctx.newPage();
  await login(page, "sin.local@example.test", "/cuenta");
  await page.goto("/registro");
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.goto("/registro?intencion=local");
  await expect(page).toHaveURL(/\/registro\/local$/);
  await ctx.close();
});
