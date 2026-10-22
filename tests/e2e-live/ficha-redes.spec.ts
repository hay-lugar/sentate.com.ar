import { expect, newContextWithIp, test } from "./fixtures";

// Paso 10 del plan (hallazgo H2): lo que el local carga en su perfil (Instagram, web, Facebook) aparece en la ficha pública.
// El seed de desarrollo trae el Instagram de «Prueba Bodegón»; el sitio web y Facebook están vacíos y no deben mostrarse.
test("la ficha pública muestra el Instagram cargado y no inventa los que faltan", async ({ browser, baseURL }) => {
  const ctx = await newContextWithIp(browser, baseURL!, "203.0.113.111");
  const page = await ctx.newPage();
  await page.goto("/prueba-bodegon");
  const links = page.getByRole("list", { name: "Enlaces del local" });
  const insta = links.getByRole("link", { name: /Instagram/ });
  await expect(insta).toBeVisible();
  await expect(insta).toHaveAttribute("href", /^https:\/\/(www\.)?instagram\.com\//);
  await expect(insta).toHaveAttribute("rel", /noopener/);
  await expect(insta).toHaveAttribute("target", "_blank");
  await expect(links.getByRole("link", { name: /Sitio web/ })).toHaveCount(0);
  await expect(links.getByRole("link", { name: /Facebook/ })).toHaveCount(0);

  // Y en los datos estructurados para buscadores (el local está listado).
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(ld!).sameAs).toEqual([expect.stringMatching(/instagram\.com/)]);
  await ctx.close();
});
