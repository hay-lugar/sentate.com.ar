import { expect, test, type Page } from "@playwright/test";

async function openReservation(page: Page) {
  const trigger = page.getByRole("button", { name: /Solicitar mesa/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Pedir una mesa" });
  await expect(dialog).toBeVisible();
  return { trigger, dialog };
}

async function completeReservation(page: Page) {
  const { dialog } = await openReservation(page);
  await dialog.getByRole("button", { name: "Continuar" }).click();
  // Un día abierto que no sea hoy, para no depender de la hora de la prueba.
  const days = dialog.getByRole("group", { name: "Elegí el día" }).locator("button:not([disabled])");
  await days.nth(2).click();
  await dialog.getByRole("group", { name: "Elegí el horario" }).locator("button:not([disabled])").first().click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByLabel("Nombre").fill("Prueba Demo");
  await dialog.getByLabel("Teléfono").fill("11 0000 0000");
  await dialog.getByRole("button", { name: "Enviar solicitud (demo)" }).click();
  return dialog;
}

test.describe("slugs", () => {
  test("/no-existe responde 404", async ({ page }) => {
    const res = await page.goto("/no-existe");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
  });

  // Sin sesión no se distingue un slug inexistente de un local real sin publicar: se pide login
  // (no se filtra qué comercios existen).
  test("/admin/no-existe sin sesión lleva al login", async ({ page }) => {
    await page.goto("/admin/no-existe");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fno-existe$/);
  });
});

test.describe("bottom sheet accesible", () => {
  test("foco inicial, contención, Escape y restauración", async ({ page }) => {
    await page.goto("/el-bodegon");
    const { trigger, dialog } = await openReservation(page);

    // Foco dentro del diálogo y fondo inert.
    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    const mainInert = () => page.locator("main").first().evaluate((el) => el.closest("[inert]") !== null);
    expect(await mainInert()).toBe(true);

    // Tab nunca sale del diálogo.
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await mainInert()).toBe(false);
  });

  test("conserva las CSS vars del tenant dentro del portal", async ({ page }) => {
    await page.goto("/sakura");
    const { dialog } = await openReservation(page);
    const brand = await dialog.evaluate((el) => getComputedStyle(el).getPropertyValue("--brand").trim());
    expect(brand).toBe("#be123c");
  });
});

test.describe("reserva simulada", () => {
  test("resultado honesto: solicitud simulada, no enviada", async ({ page }) => {
    await page.goto("/la-esquina");
    const dialog = await completeReservation(page);
    await expect(dialog.getByRole("heading", { name: "Solicitud simulada" })).toBeVisible();
    await expect(dialog).toContainText("no se envió a La Esquina");
    await expect(dialog).toContainText("Solicitud pendiente");
    await expect(dialog).not.toContainText(/WhatsApp/);
  });

  test("estado de error simulado con ?simular=error", async ({ page }) => {
    await page.goto("/sakura?simular=error");
    const dialog = await completeReservation(page);
    await expect(dialog.getByRole("heading", { name: "No pudimos enviar la solicitud" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Reintentar" })).toBeVisible();
  });

  test("valida los datos antes de avanzar", async ({ page }) => {
    await page.goto("/el-bodegon");
    const { dialog } = await openReservation(page);
    await dialog.getByRole("button", { name: "Continuar" }).click();
    await dialog.getByRole("button", { name: "Continuar" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Elegí un día");
  });
});

test.describe("estado de demo por tenant", () => {
  test("los cambios de un comercio no afectan a otro y se pueden restablecer", async ({ page }) => {
    await page.goto("/admin/el-bodegon/ajustes");
    const name = page.getByLabel("Nombre del local", { exact: true });
    await expect(name).toHaveValue("El Bodegón");
    await name.fill("Bodegón Editado");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Ajustes guardados en este navegador")).toBeVisible();

    await page.goto("/el-bodegon");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bodegón Editado");

    await page.goto("/admin/sakura/ajustes");
    await expect(page.getByLabel("Nombre del local", { exact: true })).toHaveValue("Sakura");
    await page.goto("/sakura");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sakura");

    await page.goto("/admin/el-bodegon");
    await page.getByRole("button", { name: "Restablecer demo" }).click();
    await page.getByRole("button", { name: "Sí, restablecer" }).click();
    await page.goto("/el-bodegon");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("El Bodegón");
  });

  test("el panel demo ofrece el filtro «Hoy» con solo las mesas de hoy", async ({ page }) => {
    await page.goto("/admin/el-bodegon/reservas");
    await page.getByRole("button", { name: /^Hoy/ }).click();
    const rows = page.getByRole("list").filter({ hasText: "personas" }).first().getByRole("listitem");
    await expect(rows.first()).toBeVisible();
    await expect(page.getByText("Mañana ·")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Las reservas están desactivadas" })).toHaveCount(0);
  });

  test("el registro ofrece las dos intenciones y respeta la elegida en el enlace", async ({ page }) => {
    await page.goto("/registro");
    await expect(page.getByRole("radio", { name: /Quiero descubrir locales/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Quiero publicar mi local/ })).not.toBeChecked();
    await page.goto("/registro?intencion=local");
    await expect(page.getByRole("radio", { name: /Quiero publicar mi local/ })).toBeChecked();
    // Desde «Para negocios» se llega con la intención de publicar.
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Crear cuenta" }).nth(1)).toHaveAttribute("href", "/registro?intencion=local");
  });

  test("la carta larga se puede buscar (sin tildes) y se vuelve a la carta completa", async ({ page }) => {
    await page.goto("/el-bodegon");
    const box = page.getByRole("searchbox", { name: "Buscar en la carta" });
    await box.fill("TIRAMISU");
    await expect(page.getByRole("heading", { name: "Tiramisú" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tagliatelle al ragú" })).toHaveCount(0);
    await box.fill("zzzz");
    await expect(page.getByRole("heading", { name: "Ningún plato coincide" })).toBeVisible();
    await page.getByRole("button", { name: "Quitar filtros" }).click();
    await expect(page.getByRole("heading", { name: "Tagliatelle al ragú" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Cómo llegar/ })).toHaveAttribute("href", /google\.com\/maps\/search\/\?api=1&query=/);
  });

  test("crear un plato lo muestra en el menú público", async ({ page }) => {
    await page.goto("/admin/la-esquina/menu");
    await page.getByRole("button", { name: "Plato en Burgers" }).click();
    const sheet = page.getByRole("dialog", { name: "Nuevo plato" });
    await expect(sheet.getByLabel("Nombre")).toBeFocused();
    await sheet.getByLabel("Precio (ARS)").fill("0");
    await sheet.getByLabel("Nombre").fill("Burger de prueba");
    await page.getByRole("button", { name: "Agregar plato" }).click();
    await expect(sheet.getByRole("alert")).toContainText("precio");
    await sheet.getByLabel("Precio (ARS)").fill("15.000");
    await page.getByRole("button", { name: "Agregar plato" }).click();
    await expect(sheet).toBeHidden();

    await page.goto("/la-esquina");
    await expect(page.getByRole("button", { name: /Burger de prueba, \$\s15\.000/ })).toBeVisible();
  });
});

test.describe("navegación por teclado del panel", () => {
  test("los controles tienen nombre accesible y son alcanzables", async ({ page, isMobile }) => {
    await page.goto("/admin/el-bodegon");
    const unnamed = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button, a[href], input, select, textarea"))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => {
          const name = (el.getAttribute("aria-label") ?? "") + (el.textContent ?? "").trim() + (el.getAttribute("title") ?? "") + (el.querySelector("img[alt]")?.getAttribute("alt") ?? "");
          const labelled = el.id && document.querySelector(`label[for="${el.id}"]`);
          return !name && !labelled && !el.getAttribute("aria-labelledby");
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
    if (!isMobile) {
      await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toBeVisible();
    }
  });
});

test.describe("sin overflow horizontal", () => {
  for (const width of [360, 390, 768]) {
    test(`ancho ${width}px`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await ctx.newPage();
      for (const path of ["/", "/el-bodegon", "/la-esquina", "/sakura", "/admin/el-bodegon", "/admin/la-esquina/menu", "/admin/sakura/ajustes"]) {
        await page.goto(path);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(sw, path).toBeLessThanOrEqual(width);
      }
      await ctx.close();
    });
  }
});
