import { expect, newContextWithIp, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Capacidad real: el dueño de El Bodegón fija un tope de 2 comensales; tras una reserva de 2 personas, ese horario aparece
// completo para el siguiente visitante. Al terminar se restaura «sin tope».
const PASSWORD = "sentate-dev-only";

async function ownerLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner.bodegon@example.test");
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function ownerCapacity(page: Page, value: string) {
  await page.goto("/admin/prueba-bodegon/reservas/capacidad");
  await expect(page.getByRole("heading", { name: "Capacidad y reservas" })).toBeVisible();
  await page.getByLabel(/Comensales simultáneos/).fill(value);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guardado" })).toBeVisible();
}

async function openToTimes(page: Page) {
  await page.goto("/prueba-bodegon");
  await page.getByRole("button", { name: /Solicitar mesa/ }).click();
  const dialog = page.getByRole("dialog", { name: "Pedir una mesa" });
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByRole("group", { name: "Elegí el día" }).locator("button:not([disabled])").nth(3).click();
  return dialog;
}

test("con un tope de 2 comensales, el horario reservado se muestra completo", async ({ browser, baseURL }) => {
  const owner = await newContextWithIp(browser, baseURL!, "203.0.113.51");
  const op = await owner.newPage();
  await ownerLogin(op);
  await ownerCapacity(op, "2");
  try {
    const guestA = await newContextWithIp(browser, baseURL!, "203.0.113.52");
    const pa = await guestA.newPage();
    const da = await openToTimes(pa);
    const times = da.getByRole("group", { name: "Elegí el horario" });
    const first = times.locator("button:not([disabled])").first();
    const label = ((await first.textContent()) ?? "").trim();
    await first.click();
    await da.getByRole("button", { name: "Continuar" }).click();
    await da.getByLabel("Nombre").fill(`Capacidad ${Date.now()}`);
    await da.getByLabel("Teléfono").fill("11 0000 7777");
    await da.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
    await expect(da.getByRole("heading", { name: "Solicitud enviada" })).toBeVisible();
    await guestA.close();

    const guestB = await newContextWithIp(browser, baseURL!, "203.0.113.53");
    const pb = await guestB.newPage();
    const db = await openToTimes(pb);
    const full = db.getByRole("group", { name: "Elegí el horario" }).getByRole("button", { name: new RegExp(`^${label}.*completo`) });
    await expect(full).toBeDisabled();
    await guestB.close();
  } finally {
    await ownerCapacity(op, "");
    await owner.close();
  }
});
