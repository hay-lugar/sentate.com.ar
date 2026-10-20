import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "sentate-dev-only";
const inbox = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Solicitudes y reservas" }) });
const uniquePhone = () => `11 ${String(Date.now()).slice(-8, -4)} ${String(Date.now()).slice(-4)}`;

async function login(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

test.describe("carta pública desde Supabase", () => {
  test("muestra solo lo publicado y disponible, sin marcas de demo", async ({ page }) => {
    await page.goto("/el-bodegon");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("El Bodegón");
    await expect(page.getByRole("button", { name: /Provoleta a la parrilla/ })).toBeVisible();
    await expect(page.getByText("Bondiola braseada")).toHaveCount(0);
    await expect(page.getByText(/Demo · local de ejemplo/)).toHaveCount(0);
    await expect(page.getByText("Precios en pesos argentinos.")).toBeVisible();
  });

  test("solicitud real: queda pending y aparece en el panel del dueño", async ({ page }) => {
    const name = `Comensal E2E ${Date.now()}`;
    await page.goto("/el-bodegon");
    await page.getByRole("button", { name: /Reservar mesa/ }).click();
    const dialog = page.getByRole("dialog", { name: "Pedir una mesa" });
    await dialog.getByRole("button", { name: "Continuar" }).click();
    await dialog.getByRole("group", { name: "Elegí el día" }).locator("button:not([disabled])").nth(2).click();
    await expect(dialog.getByText(/Disponibilidad ficticia/)).toHaveCount(0);
    await dialog.getByRole("group", { name: "Elegí el horario" }).locator("button:not([disabled])").first().click();
    await dialog.getByRole("button", { name: "Continuar" }).click();
    await dialog.getByLabel("Nombre").fill(name);
    await dialog.getByLabel("Teléfono").fill(uniquePhone());
    await dialog.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Solicitud enviada" })).toBeVisible();
    await expect(dialog).toContainText("Todavía no es una reserva confirmada");

    await login(page, "owner.bodegon@example.test", "/admin/el-bodegon");
    await expect(page).toHaveURL(/\/admin\/el-bodegon$/);
    await expect(inbox(page).getByRole("listitem").filter({ hasText: name })).toContainText("Nueva");
  });
});

test.describe("panel real", () => {
  test("sin sesión, el panel de un comercio real pide login", async ({ page }) => {
    await page.goto("/admin/el-bodegon");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fel-bodegon/);
  });

  test("credenciales inválidas muestran error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("owner.bodegon@example.test");
    await page.getByLabel("Contraseña").fill("incorrecta");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
  });

  test("el dueño confirma una solicitud y el cambio persiste", async ({ page }) => {
    await login(page, "owner.bodegon@example.test");
    await expect(page).toHaveURL(/\/admin\/el-bodegon$/);
    await expect(page.getByText(/Prueba gratuita/)).toBeVisible();
    await expect(page.getByText(/Modo demo/)).toHaveCount(0);
    const row = inbox(page).getByRole("listitem").filter({ hasText: "Cliente Ficticio Uno" });
    await row.getByRole("button", { name: /Confirmar/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "confirmada" })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.reload();
    await page.getByRole("button", { name: /Confirmadas/ }).click();
    await expect(inbox(page).getByRole("listitem").filter({ hasText: "Cliente Ficticio Uno" })).toContainText("Reserva confirmada");
  });

  test("alta de plato desde el panel aparece en la carta pública", async ({ page }) => {
    const dish = `Plato E2E ${Date.now()}`;
    await login(page, "owner.bodegon@example.test", "/admin/el-bodegon/menu");
    await page.getByRole("button", { name: "Plato en Postres" }).click();
    const sheet = page.getByRole("dialog", { name: "Nuevo plato" });
    await sheet.getByLabel("Nombre").fill(dish);
    await sheet.getByLabel("Precio (ARS)").fill("4.500");
    await page.getByRole("button", { name: "Agregar plato" }).click();
    await expect(sheet).toBeHidden();
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.getByText(dish)).toBeVisible();

    await page.goto("/el-bodegon");
    await expect(page.getByRole("button", { name: new RegExp(`${dish}, \\$\\s4\\.500`) })).toBeVisible();
  });

  test("ajustes: cambiar la descripción persiste en la base", async ({ page }) => {
    const tagline = `Actualizado ${Date.now()}`;
    await login(page, "owner.esquina@example.test", "/admin/la-esquina/ajustes");
    await page.getByLabel("Descripción corta").fill(tagline);
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForTimeout(2000);
    await page.goto("/la-esquina");
    await expect(page.getByText(tagline)).toBeVisible();
  });

  test("un dueño no accede al panel de otro comercio", async ({ page }) => {
    await login(page, "owner.esquina@example.test");
    await expect(page).toHaveURL(/\/admin\/la-esquina$/);
    const res = await page.goto("/admin/el-bodegon");
    expect(res?.status()).toBe(404);
  });

  test("prueba vencida: cuenta accesible, operación bloqueada", async ({ page }) => {
    await login(page, "owner.sakura@example.test");
    await expect(page).toHaveURL(/\/admin\/sakura$/);
    await expect(page.getByRole("heading", { name: /Tu prueba gratuita terminó/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirmar/ })).toHaveCount(0);
  });

  test("cerrar sesión", async ({ page }) => {
    await login(page, "owner.bodegon@example.test");
    await page.getByRole("button", { name: "Cerrar sesión" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/admin/el-bodegon");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe("alta de cuenta y local", () => {
  test("registro → alta del local → panel real con prueba de 30 días", async ({ page }) => {
    const id = Date.now();
    await page.goto("/registro");
    await page.getByLabel("Email").fill(`nuevo.${id}@example.test`);
    await page.getByLabel("Contraseña").fill("una-clave-segura");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL(/\/registro\/local$/);

    await page.getByLabel("Nombre del local").fill(`Café Prueba ${id}`);
    await expect(page.getByLabel("Dirección de tu menú")).toHaveValue(`cafe-prueba-${id}`);
    await page.getByRole("button", { name: "Crear mi local" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/cafe-prueba-${id}$`));
    await expect(page.getByText(/te quedan 30 días/)).toBeVisible();
    await expect(page.getByText("Nada por acá")).toBeVisible();

    // Nace sin publicar: la carta pública no existe todavía.
    const before = await page.request.get(`/cafe-prueba-${id}`);
    expect(before.status()).toBe(404);

    await page.getByRole("button", { name: "Publicar menú" }).click();
    await expect(page.getByText("¡Tu menú ya es público!")).toBeVisible();
    await page.goto(`/cafe-prueba-${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Café Prueba ${id}`);
    await expect(page.getByText("La carta todavía no está publicada")).toBeVisible();
  });

  test("no se puede registrar un local con un slug de demo", async ({ page }) => {
    const id = Date.now();
    await page.goto("/registro");
    await page.getByLabel("Email").fill(`demo.${id}@example.test`);
    await page.getByLabel("Contraseña").fill("una-clave-segura");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await page.getByLabel("Nombre del local").fill("Sakura");
    await page.getByRole("button", { name: "Crear mi local" }).click();
    await expect(page.getByText("Esa dirección ya está en uso. Probá con otra.")).toBeVisible();
  });
});
