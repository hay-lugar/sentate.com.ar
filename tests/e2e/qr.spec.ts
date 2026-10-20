import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { decodePng, decodeSvgInBrowser, pngSize } from "../support/qr-decode";

// Sección "QR" del panel en modo demo, con APP_URL = https://sentate.com.ar (ver playwright.config.ts):
// el origen es de piloto, así que no hay avisos de prueba y la impresión está habilitada.

const URL = "https://sentate.com.ar/el-bodegon";
const SCAN_TEXT = "Escaneá para ver la carta y solicitar una mesa";
const PAGE = "/admin/el-bodegon/qr";

test.describe("QR del comercio (demo, origen de piloto)", () => {
  test("el panel ofrece la sección QR en la navegación", async ({ page }) => {
    await page.goto("/admin/el-bodegon");
    await page.getByRole("link", { name: "QR", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/el-bodegon\/qr$/);
    await expect(page.getByRole("heading", { level: 1, name: "Código QR" })).toBeVisible();
  });

  test("muestra el enlace canónico /[slug], sin avisos de prueba, y permite copiarlo", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(PAGE);

    await expect(page.getByLabel("Enlace público de tu carta")).toHaveValue(URL);
    await expect(page.getByAltText("Código QR que abre sentate.com.ar/el-bodegon")).toBeVisible();
    await expect(page.getByText(/entorno de prueba/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Imprimir calcomanía" })).toBeEnabled();
    await expect(page.getByRole("link", { name: "Abrir mi carta" })).toHaveAttribute("href", URL);

    await page.getByRole("button", { name: "Copiar enlace" }).click();
    await expect(page.getByText("Enlace copiado.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(URL);
  });

  test("el QR de la pantalla y los archivos descargados decodifican a la URL canónica", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByAltText(/Código QR que abre/)).toBeVisible();

    // SVG descargado: se rasteriza en el navegador y se decodifica.
    const svgDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar SVG" }).click();
    const svgFile = await svgDownload;
    expect(svgFile.suggestedFilename()).toBe("qr-el-bodegon.svg");
    const svg = fs.readFileSync((await svgFile.path())!, "utf8");
    expect(svg).toContain("<svg");
    expect(await decodeSvgInBrowser(page, svg)).toBe(URL);

    // PNG descargado: 1200×1200 px y decodifica.
    const pngDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PNG" }).click();
    const pngFile = await pngDownload;
    expect(pngFile.suggestedFilename()).toBe("qr-el-bodegon.png");
    const pngPath = (await pngFile.path())!;
    expect(pngSize(pngPath)).toEqual({ width: 1200, height: 1200 });
    expect(decodePng(pngPath)).toBe(URL);

    await expect(page.getByText("Descargamos qr-el-bodegon.png.")).toBeVisible();
  });

  test("calcomanía impresa: solo se imprime la hoja, con nombre, texto y un QR que escanea", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByAltText(/Código QR que abre/)).toBeVisible();
    await page.emulateMedia({ media: "print" });

    // Se oculta todo el panel; queda la calcomanía.
    await expect(page.locator("aside:visible")).toHaveCount(0);
    await expect(page.locator("nav:visible")).toHaveCount(0);
    await expect(page.locator("header:visible")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Imprimir calcomanía" })).toBeHidden();
    // El nombre también existe en la barra lateral y la cabecera (ocultas al imprimir): se acota a la calcomanía.
    const decal = page.locator("section[aria-hidden]");
    await expect(decal.getByText("El Bodegón", { exact: true })).toBeVisible();
    await expect(decal.getByText(SCAN_TEXT, { exact: true })).toBeVisible();
    await expect(decal.getByText("sentate.com.ar/el-bodegon", { exact: true })).toBeVisible();

    // El QR impreso mide al menos 8 cm de lado (CSS a 96 px por pulgada).
    const qr = decal.locator("img");
    const box = (await qr.boundingBox())!;
    expect((box.width / 96) * 2.54).toBeGreaterThanOrEqual(8);
    expect(Math.abs(box.width - box.height)).toBeLessThan(1);

    // Lo que se ve en la hoja se decodifica a la URL: se escanea el layout impreso, no el archivo.
    expect(decodePng(await page.screenshot({ fullPage: true }))).toBe(URL);

    // Entra en una sola hoja A4.
    const pdf = await page.pdf({ format: "A4", printBackground: false });
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
  });

  test("sin desborde horizontal y sin violaciones serias de accesibilidad", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByAltText(/Código QR que abre/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === "finished" || a.playState === "idle"));
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
