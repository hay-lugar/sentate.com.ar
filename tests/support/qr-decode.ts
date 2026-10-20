import fs from "node:fs";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import type { Page } from "@playwright/test";

/** Decodifica el QR de un PNG (Buffer o ruta) con jsQR. Devuelve su texto o null. */
export function decodePng(source: Buffer | string): string | null {
  const png = PNG.sync.read(typeof source === "string" ? fs.readFileSync(source) : source);
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
}

export function pngSize(source: Buffer | string): { width: number; height: number } {
  const png = PNG.sync.read(typeof source === "string" ? fs.readFileSync(source) : source);
  return { width: png.width, height: png.height };
}

/** Rasteriza un SVG en el navegador (el mismo motor que lo muestra) y lo decodifica con jsQR inyectado en la página. */
export async function decodeSvgInBrowser(page: Page, svg: string): Promise<string | null> {
  await page.addScriptTag({ path: "node_modules/jsqr/dist/jsQR.js" });
  return page.evaluate(async (markup) => {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    await img.decode();
    const size = 800;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const jsqr = (window as unknown as { jsQR: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null }).jsQR;
    return jsqr(data, size, size)?.data ?? null;
  }, svg);
}
