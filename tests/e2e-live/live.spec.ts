import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// E2E contra Supabase LOCAL real (ver playwright.live.config.ts). Usa los datos de supabase/seed.sql:
// prueba-bodegon (cerrado lunes, domingo solo almuerzo), prueba-esquina y prueba-sakura (prueba vencida).

const PASSWORD = "sentate-dev-only";
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

const inbox = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: /Solicitudes y reservas|Todas las solicitudes/ }) });
let phoneSeq = 0;
const uniquePhone = () => `11 ${String(Date.now()).slice(-6, -2)} ${String(++phoneSeq).padStart(4, "0")}`;
const toast = (page: Page, text: string | RegExp) => page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: text });

async function login(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

async function ownerPage(browser: Browser, email: string, path: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email, path);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  return page;
}

/** Pide una mesa desde la carta pública y devuelve el nombre usado. */
async function requestTable(page: Page, slug: string, name = `Comensal ${Date.now()}`) {
  await page.goto(`/${slug}`);
  await page.getByRole("button", { name: /Reservar mesa/ }).click();
  const dialog = page.getByRole("dialog", { name: "Pedir una mesa" });
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByRole("group", { name: "Elegí el día" }).locator("button:not([disabled])").nth(2).click();
  await dialog.getByRole("group", { name: "Elegí el horario" }).locator("button:not([disabled])").first().click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByLabel("Nombre").fill(name);
  await dialog.getByLabel("Teléfono").fill(uniquePhone());
  await dialog.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Solicitud enviada" })).toBeVisible();
  return name;
}

/** Enlace de confirmación del email de alta (Mailpit del stack local). */
async function confirmationLink(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { HTML: string; Text: string };
      const link = (msg.HTML + msg.Text).match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+/)?.[0];
      if (link) return link.replaceAll("&amp;", "&");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No llegó el email de confirmación a ${email}`);
}

async function expectAccessible(page: Page) {
  // reducedMotion no detiene las animaciones de opacidad (framer-motion): axe debe medir el estado final.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === "finished" || a.playState === "idle"));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("recorrido completo del dueño", () => {
  test("registro → confirmación de email → alta → carta → horarios por día → publicar", async ({ page }) => {
    const id = Date.now();
    const email = `nuevo.${id}@example.test`;
    const slug = `cafe-prueba-${id}`;

    await page.goto("/registro");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill("una-clave-segura");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText(`Te enviamos un email a ${email}`)).toBeVisible();

    // Sin confirmar no se puede ingresar.
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill("una-clave-segura");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByText(/confirmar tu email/)).toBeVisible();

    // El enlace del email vuelve por /auth/callback (PKCE) y sigue con el alta del local.
    await page.goto(await confirmationLink(email));
    await expect(page).toHaveURL(/\/registro\/local$/);

    await page.getByLabel("Nombre del local").fill(`Café Prueba ${id}`);
    await expect(page.getByLabel("Dirección de tu menú")).toHaveValue(slug);
    await page.getByRole("button", { name: "Crear mi local" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${slug}$`));
    await expect(page.getByText(/te quedan 30 días/)).toBeVisible();
    expect((await page.request.get(`/${slug}`)).status()).toBe(404); // nace sin publicar

    // Carta: categoría + plato.
    await page.goto(`/admin/${slug}/menu`);
    await page.getByLabel("Nueva categoría").fill("Cafetería");
    await page.getByRole("button", { name: "Crear" }).click();
    // Sin esperar la confirmación: el plato se encola y usa el ID real de la categoría al ejecutarse.
    await page.getByRole("button", { name: "Plato en Cafetería" }).click();
    const sheet = page.getByRole("dialog", { name: "Nuevo plato" });
    await sheet.getByLabel("Nombre").fill("Cortado");
    await sheet.getByLabel("Precio (ARS)").fill("2.800");
    await page.getByRole("button", { name: "Agregar plato" }).click();
    await expect(toast(page, "“Cortado” agregado")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Cortado")).toBeVisible(); // persistido en la categoría correcta

    // Horarios DISTINTOS por día + cierre excepcional.
    await page.goto(`/admin/${slug}/ajustes`);
    await page.getByLabel("Teléfono del local").fill("11 4000 0000");
    await page.getByLabel("Dirección", { exact: true }).fill("Calle Falsa 123");
    const day = (name: string) => page.getByRole("listitem", { name: `Horarios del ${name}` });
    for (const d of ["martes", "miércoles", "jueves", "viernes"]) await day(d).getByRole("button", { name: `${d}: cerrado` }).click();
    await day("viernes").getByRole("button", { name: /Agregar turno/ }).click();
    await day("viernes").getByLabel("Cierra", { exact: true }).nth(1).selectOption("23:30");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(toast(page, "Ajustes guardados")).toBeVisible();

    await page.reload();
    await expect(day("viernes").getByLabel("Nombre del turno")).toHaveCount(2);
    await expect(day("martes").getByLabel("Nombre del turno")).toHaveCount(1);
    await expect(day("lunes").getByRole("button", { name: "lunes: cerrado" })).toBeVisible();

    // Publicar.
    await page.goto(`/admin/${slug}`);
    await page.getByRole("button", { name: "Publicar menú" }).click();
    await expect(toast(page, "¡Tu menú ya es público!")).toBeVisible();
    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Café Prueba ${id}`);
    await expect(page.getByRole("button", { name: /Cortado, \$\s2\.800/ })).toBeVisible();
    await expect(page.getByRole("list", { name: "Horarios" })).toContainText("Mar a Jue · 12:00–16:00");
    await expect(page.getByRole("list", { name: "Horarios" })).toContainText("Vie · 12:00–16:00 · 20:00–23:30");
  });

  test("no se puede registrar un local con un slug de demo", async ({ page }) => {
    const id = Date.now();
    const email = `demo.${id}@example.test`;
    await page.goto("/registro");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill("una-clave-segura");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await page.goto(await confirmationLink(email));
    await page.getByLabel("Nombre del local").fill("Sakura");
    await page.getByRole("button", { name: "Crear mi local" }).click();
    await expect(page.getByText("Esa dirección ya está en uso. Probá con otra.")).toBeVisible();
  });
});

test.describe("carta pública desde Supabase", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test("muestra solo lo publicado, sin marcas de demo y con horarios por día", async ({ page }) => {
    await page.goto("/prueba-bodegon");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("El Bodegón");
    await expect(page.getByRole("button", { name: /Provoleta a la parrilla/ })).toBeVisible();
    await expect(page.getByText("Bondiola braseada")).toHaveCount(0);
    await expect(page.getByText(/Demo · local de ejemplo/)).toHaveCount(0);
    // Domingo solo almuerzo: los días distintos NO se colapsan.
    await expect(page.getByRole("list", { name: "Horarios" })).toContainText("Mar a Sáb · 12:00–16:00 · 20:00–00:30");
    await expect(page.getByRole("list", { name: "Horarios" })).toContainText("Dom · 12:00–16:00");
    await expectAccessible(page);
  });

  test("las demos siguen siendo locales", async ({ page }) => {
    await page.goto("/el-bodegon");
    await expect(page.getByText(/Demo · local de ejemplo/)).toBeVisible();
  });
});

test.describe("reservas en vivo", () => {
  test("una solicitud aparece sola en el panel del dueño, y NO en el de otro comercio", async ({ browser, page }) => {
    const owner = await ownerPage(browser, "owner.bodegon@example.test", "/admin/prueba-bodegon/reservas");
    const other = await ownerPage(browser, "owner.esquina@example.test", "/admin/prueba-esquina/reservas");
    await expect(owner.getByText("En vivo")).toBeVisible();
    await expect(other.getByText("En vivo")).toBeVisible();

    const name = await requestTable(page, "prueba-bodegon");

    // Sin recargar: llega por Realtime (canal privado autorizado por RLS).
    const row = inbox(owner).getByRole("listitem").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(toast(owner, `Nueva solicitud de ${name.split(" ")[0]}`)).toBeVisible();
    await expect(inbox(other).getByRole("listitem").filter({ hasText: name })).toHaveCount(0);

    // Confirmar: se anuncia recién cuando la base confirma, y persiste.
    await row.getByRole("button", { name: /Confirmar/ }).click();
    await expect(toast(owner, "confirmada")).toBeVisible();
    await owner.reload();
    await owner.getByRole("button", { name: /Confirmadas/ }).click();
    await expect(inbox(owner).getByRole("listitem").filter({ hasText: name })).toContainText("Reserva confirmada");
    await expect(inbox(other).getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
    await owner.context().close();
    await other.context().close();
  });

  test("dos pestañas del mismo dueño: la segunda recibe la respuesta en vivo y deja de ofrecer Confirmar", async ({ browser, page }) => {
    const name = await requestTable(page, "prueba-bodegon");
    const a = await ownerPage(browser, "owner.bodegon@example.test", "/admin/prueba-bodegon/reservas");
    const b = await a.context().newPage();
    await b.goto("/admin/prueba-bodegon/reservas");
    await expect(b.getByText("En vivo")).toBeVisible();

    await inbox(a).getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: /Rechazar/ }).click();
    await expect(toast(a, "rechazada")).toBeVisible();
    // La otra pestaña recibe el cambio en vivo: ya no ofrece Confirmar.
    await expect(inbox(b).getByRole("listitem").filter({ hasText: name })).toHaveCount(0, { timeout: 10_000 });
    await b.getByRole("button", { name: /Rechazadas/ }).click();
    await expect(inbox(b).getByRole("listitem").filter({ hasText: name })).toContainText("Solicitud rechazada");
    await a.context().close();
  });
});

test.describe("errores y estados", () => {
  test("sin red: no anuncia éxito, revierte y ofrece reintentar", async ({ browser, page }) => {
    const name = await requestTable(page, "prueba-bodegon");
    const owner = await ownerPage(browser, "owner.bodegon@example.test", "/admin/prueba-bodegon/reservas");
    const row = inbox(owner).getByRole("listitem").filter({ hasText: name });
    await expect(row).toBeVisible();

    await owner.route("**/*", (route) => (route.request().headers()["next-action"] ? route.abort("internetdisconnected") : route.continue()));
    await row.getByRole("button", { name: /Confirmar/ }).click();
    await expect(toast(owner, "Sin conexión. No se guardó el cambio.")).toBeVisible();
    await expect(toast(owner, "confirmada")).toHaveCount(0);
    await expect(row.getByRole("button", { name: /Confirmar/ })).toBeVisible(); // revertido a pendiente

    await owner.unroute("**/*");
    await owner.getByRole("button", { name: "Reintentar" }).click();
    await expect(toast(owner, "confirmada")).toBeVisible();
    await owner.context().close();
  });

  test("sesión vencida: no guarda y pide volver a ingresar", async ({ browser }) => {
    const owner = await ownerPage(browser, "owner.esquina@example.test", "/admin/prueba-esquina/ajustes");
    await owner.context().clearCookies();
    await owner.getByLabel("Descripción corta").fill("No debería guardarse");
    await owner.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(toast(owner, "Tu sesión venció")).toBeVisible();
    await owner.getByRole("button", { name: "Ingresar" }).click();
    await expect(owner).toHaveURL(/\/login\?next=%2Fadmin%2Fprueba-esquina%2Fajustes/);
    await owner.goto("/prueba-esquina");
    await expect(owner.getByText("No debería guardarse")).toHaveCount(0);
    await owner.context().close();
  });

  test("ajustes en dos pestañas: la versión vieja no pisa la nueva", async ({ browser }) => {
    const a = await ownerPage(browser, "owner.esquina@example.test", "/admin/prueba-esquina/ajustes");
    const b = await a.context().newPage();
    await b.goto("/admin/prueba-esquina/ajustes");

    const tagline = `Desde A ${Date.now()}`;
    await a.getByLabel("Descripción corta").fill(tagline);
    await a.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(toast(a, "Ajustes guardados")).toBeVisible();

    await b.getByLabel("Nombre del local").fill("Pisado desde B");
    await b.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(b.getByRole("alert").filter({ hasText: /otra pestaña o dispositivo/ }).first()).toBeVisible();

    await a.goto("/prueba-esquina");
    await expect(a.getByText(tagline)).toBeVisible();
    await expect(a.getByRole("heading", { level: 1 })).not.toHaveText("Pisado desde B");
    await a.context().close();
  });

  test("guardar colores no reescribe los horarios por día", async ({ browser }) => {
    const owner = await ownerPage(browser, "owner.bodegon@example.test", "/admin/prueba-bodegon/ajustes");
    await owner.getByLabel("Color principal").fill("#7c2d12");
    await owner.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(toast(owner, "Ajustes guardados")).toBeVisible();
    await owner.goto("/prueba-bodegon");
    await expect(owner.getByRole("list", { name: "Horarios" })).toContainText("Dom · 12:00–16:00");
    await expect(owner.getByRole("list", { name: "Horarios" })).toContainText("Mar a Sáb · 12:00–16:00 · 20:00–00:30");
    await owner.context().close();
  });

  test("credenciales inválidas muestran error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("owner.bodegon@example.test");
    await page.getByLabel("Contraseña").fill("incorrecta");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
  });
});

test.describe("acceso", () => {
  test("sin sesión, el panel de un comercio real pide login", async ({ page }) => {
    await page.goto("/admin/prueba-bodegon");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fprueba-bodegon/);
  });

  test("otro dueño: 'sin acceso' (no un 404 engañoso ni el panel)", async ({ page }) => {
    await login(page, "owner.esquina@example.test");
    await expect(page).toHaveURL(/\/admin\/prueba-esquina$/);
    await page.goto("/admin/prueba-bodegon");
    await expect(page.getByRole("heading", { name: "No tenés acceso a este panel" })).toBeVisible();
    await expect(page.getByText("Cliente Ficticio Uno")).toHaveCount(0);
  });

  test("comercio inexistente: 404", async ({ page }) => {
    await login(page, "owner.esquina@example.test");
    await expect(page).toHaveURL(/\/admin\/prueba-esquina$/);
    const res = await page.goto("/admin/no-existe-este-local");
    expect(res?.status()).toBe(404);
  });

  test("prueba vencida: cuenta accesible, operación bloqueada", async ({ page }) => {
    await login(page, "owner.sakura@example.test");
    await expect(page).toHaveURL(/\/admin\/prueba-sakura$/);
    await expect(page.getByRole("heading", { name: /Tu prueba gratuita terminó/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirmar/ })).toHaveCount(0);
  });

  test("cerrar sesión", async ({ page }) => {
    await login(page, "owner.bodegon@example.test");
    await page.getByRole("button", { name: "Cerrar sesión" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/admin/prueba-bodegon");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe("accesibilidad y mobile", () => {
  // axe mide el contraste final: expectAccessible espera a que terminen las animaciones de entrada.
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  for (const path of ["", "/reservas", "/menu", "/ajustes"]) {
    test(`panel${path || " (inicio)"}: sin violaciones serias de a11y`, async ({ page }) => {
      await login(page, "owner.bodegon@example.test", `/admin/prueba-bodegon${path}`);
      await expect(page).toHaveURL(new RegExp(`/admin/prueba-bodegon${path}$`));
      await expectAccessible(page);
    });
  }

  test("login: sin violaciones serias de a11y", async ({ page }) => {
    await page.goto("/login");
    await expectAccessible(page);
  });

  for (const width of [360, 390]) {
    test(`mobile ${width}px: panel de ajustes y reservas sin scroll horizontal`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await login(page, "owner.bodegon@example.test", "/admin/prueba-bodegon/ajustes");
      await expect(page).toHaveURL(/\/ajustes$/);
      for (const path of ["/ajustes", "/reservas", "/menu"]) {
        await page.goto(`/admin/prueba-bodegon${path}`);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
      await ctx.close();
    });
  }
});
