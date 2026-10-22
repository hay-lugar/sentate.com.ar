import { expect, test, type Page } from "@playwright/test";

// Marca visible temporal: «{Sin Nombre}». El nombre anterior no puede quedar visible en ninguna pantalla, salvo en las
// URLs (el dominio no cambia). No se mira el código sino lo que el usuario ve y lo que anuncian los lectores de pantalla.

const NAME = "{Sin Nombre}";
const PREVIOUS = /sentate/i;

/** Texto visible, nombres accesibles, título y metadatos de la página, sin contar las URLs (el dominio es técnico). */
async function visibleStrings(page: Page) {
  const strings = await page.evaluate(() => {
    const out: string[] = [document.title, document.body.innerText];
    for (const el of document.querySelectorAll("[aria-label], [alt], [title], [placeholder]")) {
      for (const attr of ["aria-label", "alt", "title", "placeholder"]) {
        const v = el.getAttribute(attr);
        if (v) out.push(v);
      }
    }
    for (const m of document.querySelectorAll('meta[name="description"], meta[name="application-name"], meta[property^="og:"]')) {
      out.push(m.getAttribute("content") ?? "");
    }
    return out;
  });
  return strings.map((s) => s.replace(/https?:\/\/\S+/g, "").replace(/\b[\w.-]*sentate\.com\.ar\S*/gi, ""));
}

const PUBLIC = ["/", "/login", "/registro", "/recuperar", "/el-bodegon", "/la-esquina", "/sakura", "/no-existe"];
const PANEL = ["/admin/el-bodegon", "/admin/el-bodegon/reservas", "/admin/el-bodegon/menu", "/admin/el-bodegon/ajustes", "/admin/el-bodegon/qr"];

test.describe("marca «{Sin Nombre}»", () => {
  for (const path of [...PUBLIC, ...PANEL]) {
    test(`${path}: ninguna mención visible a la marca anterior`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      for (const s of await visibleStrings(page)) expect(s).not.toMatch(PREVIOUS);
    });
  }

  test("la landing muestra la marca en la navegación y en el pie, con las llaves", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByText(NAME, { exact: true })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText(`© ${NAME}`);
    await expect(page).toHaveTitle(new RegExp(`^${NAME.replace(/[{}]/g, "\\$&")} — Descubrí dónde comer`));
  });

  for (const path of ["/login", "/registro", "/recuperar"]) {
    test(`${path}: el título de la página y el enlace de inicio llevan la marca`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(new RegExp(`· ${NAME.replace(/[{}]/g, "\\$&")}$`));
      await expect(page.getByRole("link", { name: `${NAME}, inicio` })).toBeVisible();
    });
  }

  test("el panel muestra la marca una vez y la carta conserva el nombre del comercio", async ({ page }) => {
    await page.goto("/admin/el-bodegon");
    // Una vez por pantalla: en el menú lateral (escritorio) o en la barra superior (celular).
    const occurrences = (await page.locator("body").innerText()).split(NAME).length - 1;
    expect(occurrences).toBe(1);
    await page.goto("/el-bodegon");
    await expect(page.getByRole("heading", { level: 1, name: "El Bodegón" })).toBeVisible();
    await expect(page.locator("body")).toContainText(`Carta digital por ${NAME}`);
  });

  test("el símbolo es un vector propio sin texto y no se sirve el logo con el nombre anterior", async ({ request }) => {
    const symbol = await request.get("/marca/cubiertos.svg");
    expect(symbol.status()).toBe(200);
    expect(await symbol.text()).not.toMatch(/<text|<image/i);
    expect((await request.get("/sentate.svg")).status()).toBe(404);
  });

  test("las URLs existentes siguen funcionando", async ({ request }) => {
    for (const path of ["/", "/login", "/registro", "/recuperar", "/el-bodegon", "/admin/el-bodegon", "/robots.txt"]) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
  });
});
