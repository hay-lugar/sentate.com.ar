import { expect, newContextWithIp, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Las reservas son opcionales: un local que las desactiva solo muestra su carta y un acceso para llamar.
const PASSWORD = "sentate-dev-only";

async function setAccepts(page: Page, on: boolean) {
  await page.goto("/admin/prueba-bodegon/reservas/capacidad");
  const box = page.getByRole("checkbox", { name: /Recibir solicitudes de mesa por la web/ });
  if ((await box.isChecked()) !== on) {
    await box.setChecked(on);
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Guardado" })).toBeVisible();
  }
}

test("un local sin reservas muestra carta y llamada, no «Solicitar mesa», y el explorador lo distingue", async ({ browser, baseURL }) => {
  const owner = await newContextWithIp(browser, baseURL!, "203.0.113.91");
  const op = await owner.newPage();
  await op.goto("/login");
  await op.getByLabel("Email").fill("owner.bodegon@example.test");
  await op.getByLabel("Contraseña").fill(PASSWORD);
  await op.getByRole("button", { name: "Ingresar" }).click();
  await op.waitForURL((u) => !u.pathname.startsWith("/login"));
  await setAccepts(op, false);
  try {
    // El panel se adapta: sin solicitudes ni agenda, con un aviso para volver a activarlas.
    await op.goto("/admin/prueba-bodegon");
    await expect(op.getByRole("heading", { name: "Las reservas están desactivadas" })).toBeVisible();
    await expect(op.getByRole("link", { name: "Activar reservas" })).toBeVisible();
    await expect(op.getByText("Solicitudes pendientes")).toHaveCount(0);
    await expect(op.getByRole("heading", { name: "Servicio de hoy" })).toHaveCount(0);
    await op.goto("/admin/prueba-bodegon/reservas");
    await expect(op.getByRole("heading", { name: "Las reservas están desactivadas" })).toBeVisible();
    const pub = await newContextWithIp(browser, baseURL!, "203.0.113.92");
    const pp = await pub.newPage();
    await pp.goto("/prueba-bodegon");
    await expect(pp.getByRole("link", { name: "Llamar al local" })).toBeVisible();
    await expect(pp.getByRole("button", { name: /Solicitar mesa/ })).toHaveCount(0);

    await pp.goto("/explorar");
    const card = pp.getByRole("article", { name: "El Bodegón" });
    await expect(card.getByRole("link", { name: "Ver carta" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Pedir mesa" })).toHaveCount(0);
    await pp.goto("/explorar?reserva=1");
    await expect(pp.getByRole("heading", { name: "El Bodegón" })).toHaveCount(0);
    await expect(pp.getByRole("heading", { name: "La Esquina" })).toBeVisible();
    await pub.close();
  } finally {
    await setAccepts(op, true);
    // Con las reservas activas vuelve el flujo completo, incluido el filtro «Hoy».
    await op.goto("/admin/prueba-bodegon/reservas");
    await expect(op.getByRole("heading", { name: "Las reservas están desactivadas" })).toHaveCount(0);
    await expect(op.getByRole("button", { name: /^Hoy/ })).toBeVisible();
    await owner.close();
  }
});

test("sin proveedor de avisos configurado, el formulario no ofrece email ni promete notificaciones", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.93");
  const page = await ctx.newPage();
  await page.goto("/prueba-esquina");
  await page.getByRole("button", { name: /Solicitar mesa/ }).click();
  const dialog = page.getByRole("dialog", { name: "Pedir una mesa" });
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByRole("group", { name: "Elegí el día" }).locator("button:not([disabled])").nth(1).click();
  await dialog.getByRole("group", { name: "Elegí el horario" }).locator("button:not([disabled])").first().click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByLabel("Nombre")).toBeVisible();
  await expect(dialog.getByText(/Avisarme por email/)).toHaveCount(0);
  await expect(dialog.getByText(/no envía mensajes automáticos/)).toBeVisible();
  await ctx.close();
});
