import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Reglas de la identidad visual: se comprueban en el producto renderizado, no en el código.

const SLOGANS = [/Tu local lleno/i, /Tu fila, vac[ií]a/i, /Cero dolores/i, /M[eé]tricas que importan/i, /letra chica/i, /No hagas fila/i, /Listo en 10 minutos/i];
const PUBLIC_PAGES = ["/", "/login", "/registro", "/recuperar", "/el-bodegon"];

async function infiniteAnimations(page: Page) {
  return page.evaluate(() =>
    document
      .getAnimations()
      // Los indicadores de carga (animate-spin) son feedback de una acción en curso, no decoración.
      .filter((a) => a.effect?.getTiming().iterations === Infinity && !(a.effect as KeyframeEffect).target?.closest("[aria-busy]"))
      .map((a) => (a.effect as KeyframeEffect).target?.tagName),
  );
}

test.describe("landing", () => {
  test("presenta producto, cómo se ve y precio sin eslóganes, y el precio una sola vez", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Descubrí dónde comer/);
    await expect(page.getByRole("search")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tu carta, tu presencia online/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Así se ve" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Precio" })).toBeVisible();
    const main = await page.locator("main").innerText();
    expect(main.match(/14\.999/g)).toHaveLength(1);
    expect(main.match(/30 días gratis/gi)).toHaveLength(1);
    // Sin testimonios ni cifras inventadas: ningún porcentaje ni conteo de clientes.
    expect(main).not.toMatch(/\d+\s?%|clientes|locales ya|testimonio/i);
  });

  test("todo el contenido es visible de entrada, sin depender de animaciones", async ({ page }) => {
    await page.goto("/");
    for (const name of ["Así se ve", "Precio"]) await expect(page.getByRole("heading", { name })).toBeInViewport({ ratio: 0 }).catch(() => {});
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll("main h1, main h2, main h3, main p, main figure")].filter((el) => Number(getComputedStyle(el).opacity) < 1).length,
    );
    expect(hidden).toBe(0);
  });

  test("el símbolo de los cubiertos se muestra con sus proporciones originales", async ({ page }) => {
    await page.goto("/");
    const symbol = page.getByRole("banner").locator('img[src*="cubiertos"]');
    await expect(symbol).toBeVisible();
    // Con el rectángulo real (fraccionario): `img.width` redondea a píxeles enteros y a 20 px de alto falsea la proporción.
    const { w, h, nw, nh } = await symbol.evaluate((img: HTMLImageElement) => {
      const r = img.getBoundingClientRect();
      return { w: r.width, h: r.height, nw: img.naturalWidth, nh: img.naturalHeight };
    });
    expect(Math.abs(w / h - nw / nh)).toBeLessThan(0.01);
  });
});

test.describe("sistema visual", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path}: sin eslóganes ni animaciones infinitas, y sin fuentes externas`, async ({ page }) => {
      const external: string[] = [];
      page.on("request", (r) => {
        if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url());
      });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const text = await page.locator("body").innerText();
      for (const slogan of SLOGANS) expect(text).not.toMatch(slogan);
      expect(await infiniteAnimations(page)).toEqual([]);
      expect(external).toEqual([]);
    });
  }

  test("el panel demo: sin animaciones infinitas ni métricas ficticias de visitas", async ({ page }) => {
    await page.goto("/admin/el-bodegon");
    await page.waitForLoadState("networkidle");
    expect(await infiniteAnimations(page)).toEqual([]);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/visitas|vs\. semana anterior|\+21%/i);
    // Un solo aviso de demo.
    await expect(page.getByText(/Modo demo/)).toHaveCount(1);
  });

  test("la carta conserva los colores del comercio y el panel usa la base neutra", async ({ page }) => {
    await page.goto("/el-bodegon");
    const tenant = await page.getByRole("button", { name: /Solicitar mesa/ }).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tenant).toBe("rgb(184, 70, 27)"); // #B8461B, el color guardado de El Bodegón
    await page.goto("/admin/el-bodegon");
    const panel = await page.getByRole("button", { name: /Confirmar/ }).first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(panel).toBe("rgb(29, 29, 31)"); // la tinta de la plataforma
  });

  for (const path of ["/", "/login", "/el-bodegon", "/admin/el-bodegon", "/admin/el-bodegon/menu", "/admin/el-bodegon/ajustes"]) {
    test(`${path}: sin violaciones serias de accesibilidad`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
});
