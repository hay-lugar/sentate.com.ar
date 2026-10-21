import { expect, test } from "@playwright/test";

// Configuración de despliegue (next.config.ts, app/robots.ts), probada contra el build de producción.

test.describe("cabeceras de seguridad", () => {
  for (const path of ["/", "/login", "/el-bodegon", "/admin/el-bodegon", "/robots.txt"]) {
    test(`${path}`, async ({ request }) => {
      const headers = (await request.get(path)).headers();
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["permissions-policy"]).toContain("geolocation=(self)");
      expect(headers["x-powered-by"]).toBeUndefined();
    });
  }
});

test.describe("indexación", () => {
  test("robots.txt permite lo público y bloquea panel, ingreso, alta, recuperación y enlaces de email", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/User-Agent: \*/i);
    expect(body).toMatch(/^Allow: \/$/m);
    for (const path of ["/admin", "/login", "/registro", "/recuperar", "/auth/", "/cuenta", "/api/"]) expect(body).toContain(`Disallow: ${path}`);
  });

  for (const path of ["/login", "/registro", "/recuperar", "/admin/el-bodegon", "/el-bodegon"]) {
    test(`${path} lleva noindex`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    });
  }

  // La carta de la demo es un local de ejemplo: lleva noindex a propósito (arriba). Solo la landing se indexa.
  test("/ se puede indexar", async ({ page }) => {
    await page.goto("/");
    const robots = page.locator('meta[name="robots"]');
    if ((await robots.count()) > 0) await expect(robots).not.toHaveAttribute("content", /noindex/);
  });
});
