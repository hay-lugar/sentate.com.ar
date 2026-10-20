import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { decodePng, decodeSvgInBrowser } from "../support/qr-decode";

// Sección QR del panel con comercios REALES (Supabase local). El servidor de esta suite corre con
// APP_URL = http://localhost:<puerto> (ver playwright.live.config.ts): un origen de prueba, no de piloto.

const PASSWORD = "sentate-dev-only";
const ORIGIN = `http://localhost:${process.env.E2E_LIVE_PORT ?? 3300}`;

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/.]/g, "\\$&")}$`));
}

test.describe("QR del comercio (Supabase real, origen de prueba)", () => {
  test("carta publicada con origen de prueba: avisa, bloquea imprimir y marca los archivos como prueba", async ({ page }) => {
    await login(page, "owner.bodegon@example.test", "/admin/prueba-bodegon/qr");
    const url = `${ORIGIN}/prueba-bodegon`;

    await expect(page.getByLabel("Enlace público de tu carta")).toHaveValue(url);
    await expect(page.getByText(/Este QR apunta a/)).toBeVisible();
    await expect(page.getByText(/todavía no está publicada/)).toHaveCount(0);

    // Sin material imprimible hacia localhost.
    await expect(page.getByRole("button", { name: "Imprimir calcomanía" })).toBeDisabled();
    await expect(page.getByText("Imprimir está bloqueado mientras el enlace apunte a un entorno de prueba.")).toBeVisible();

    // Los archivos se descargan igual, pero llevan «-prueba» y decodifican a la URL real del comercio.
    await expect(page.getByAltText(/Código QR que abre/)).toBeVisible();
    const svgDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar SVG" }).click();
    const svgFile = await svgDownload;
    expect(svgFile.suggestedFilename()).toBe("qr-prueba-bodegon-prueba.svg");
    expect(await decodeSvgInBrowser(page, fs.readFileSync((await svgFile.path())!, "utf8"))).toBe(url);

    const pngDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PNG" }).click();
    const pngFile = await pngDownload;
    expect(pngFile.suggestedFilename()).toBe("qr-prueba-bodegon-prueba.png");
    expect(decodePng((await pngFile.path())!)).toBe(url);
  });

  test("el QR que abre el teléfono lleva a la carta pública del comercio", async ({ page, request }) => {
    await login(page, "owner.bodegon@example.test", "/admin/prueba-bodegon/qr");
    // La URL del QR es exactamente la carta pública canónica y responde.
    const link = await page.getByLabel("Enlace público de tu carta").inputValue();
    expect(link).toBe(`${ORIGIN}/prueba-bodegon`);
    const res = await request.get(link);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("El Bodegón");
  });

  test("carta sin publicar: advierte que quien escanee verá «no encontrado» y enlaza a Inicio", async ({ page, request }) => {
    await login(page, "owner.borrador@example.test", "/admin/prueba-borrador/qr");
    await expect(page.getByText(/todavía no está publicada/)).toBeVisible();
    // Es verdad: la carta no existe para el público.
    expect((await request.get(`${ORIGIN}/prueba-borrador`)).status()).toBe(404);

    await page.getByRole("link", { name: "Ir a Inicio para publicarla" }).click();
    await expect(page).toHaveURL(/\/admin\/prueba-borrador$/);
  });

  test("otro dueño no accede al QR de un comercio ajeno", async ({ page }) => {
    await login(page, "owner.esquina@example.test", "/admin/prueba-esquina");
    await page.goto("/admin/prueba-bodegon/qr");
    await expect(page.getByRole("heading", { name: "No tenés acceso a este panel" })).toBeVisible();
    await expect(page.getByLabel("Enlace público de tu carta")).toHaveCount(0);
  });

  test("sin sesión, la sección QR pide ingresar", async ({ page }) => {
    await page.goto("/admin/prueba-bodegon/qr");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  for (const width of [360, 390]) {
    test(`${width}px: la sección QR no desborda y los botones se tocan bien`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await login(page, "owner.bodegon@example.test", "/admin/prueba-bodegon/qr");
      await expect(page.getByAltText(/Código QR que abre/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const name of ["Copiar enlace", "Descargar SVG", "Descargar PNG"]) {
        const box = await page.getByRole("button", { name }).boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await ctx.close();
    });
  }
});
