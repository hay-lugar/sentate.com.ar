import { expect, test } from "./fixtures";

// Perfil del explorador del dueño contra Supabase LOCAL: usa prueba-borrador (owner.borrador@example.test).
const PASSWORD = "sentate-dev-only";

test("el dueño completa y confirma la ubicación; queda guardada y se informa lo que falta", async ({ page }) => {
  await page.goto(`/login?next=${encodeURIComponent("/admin/prueba-borrador/explorador")}`);
  await page.getByLabel("Email").fill("owner.borrador@example.test");
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/admin\/prueba-borrador\/explorador$/);

  await expect(page.getByRole("heading", { name: /Estado en el explorador/ })).toContainText("Borrador");
  await expect(page.getByText("Para enviar a revisión falta:")).toBeVisible();

  await page.getByLabel("Tipo de comercio").selectOption("cafeteria");
  await page.getByRole("button", { name: "Argentina" }).click();
  await page.getByLabel("Dirección", { exact: true }).fill("Av. Rivadavia 1000");
  await page.getByLabel("Provincia").selectOption("caba");
  await page.getByLabel("Localidad").fill("Almagro");
  await page.getByText("Ingresar coordenadas manualmente").click();
  await page.getByLabel("Latitud").fill("-34.6097");
  await page.getByLabel("Longitud").fill("-58.4126");
  await page.getByRole("button", { name: "Guardar y confirmar ubicación" }).click();
  await expect(page.getByText("Ubicación confirmada y perfil guardado.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Tipo de comercio")).toHaveValue("cafeteria");
  await expect(page.getByLabel("Localidad")).toHaveValue("Almagro");
  await expect(page.getByText("Ubicación confirmada.")).toBeVisible();
  await expect(page.getByText("Ubicación confirmada en el mapa")).toHaveCount(0);
});

test("un enlace de Instagram inválido se marca sin guardar", async ({ page }) => {
  await page.goto(`/login?next=${encodeURIComponent("/admin/prueba-borrador/explorador")}`);
  await page.getByLabel("Email").fill("owner.borrador@example.test");
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByLabel("Instagram").fill("http://instagram.com/x");
  await page.getByRole("button", { name: "Guardar y confirmar ubicación" }).click();
  await expect(page.getByText("Revisá los campos marcados.")).toBeVisible();
});
