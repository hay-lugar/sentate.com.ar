import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Modo oscuro (sigue al sistema) y texto grande (tipografía dinámica: todo está en rem, así que escala junto).
const PAGES = ["/", "/login", "/el-bodegon", "/admin/el-bodegon", "/admin/el-bodegon/menu"];

test.describe("modo oscuro", () => {
  test.use({ colorScheme: "dark" });

  test("el fondo y el texto se invierten, y la carta conserva el color de marca del comercio", async ({ page }) => {
    await page.goto("/");
    const body = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { bg: s.backgroundColor, fg: s.color };
    });
    expect(body.bg).toBe("rgb(0, 0, 0)");
    expect(body.fg).toBe("rgb(245, 245, 247)");

    await page.goto("/el-bodegon");
    const brand = await page.evaluate(() => getComputedStyle(document.querySelector("[style*='--brand']") as HTMLElement).getPropertyValue("--brand").trim());
    expect(brand).not.toBe("");
    expect(brand.toLowerCase()).not.toBe("#f5f5f7"); // el de la plataforma; la carta usa el suyo
  });

  for (const path of PAGES) {
    test(`${path}: sin violaciones serias de accesibilidad, contraste incluido`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
});

test.describe("texto grande", () => {
  for (const path of PAGES) {
    test(`${path}: con el texto al 140 % no hay desborde horizontal a 360 px`, async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({ baseURL, viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await page.goto(path);
      await page.addStyleTag({ content: "html { font-size: 22.4px !important; }" });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
      await ctx.close();
    });
  }
});
