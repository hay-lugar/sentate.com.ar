// Regenera las capturas de «Así se ve» de la landing (public/producto/*.webp) desde la demo en marcha.
// Uso: levantá la app (`npm run build && npx next start -p 3600`) y corré `node scripts/landing-shots.mjs [baseUrl]`.
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:3600";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });

async function shot(path, viewport, scale, out, prepare) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, reducedMotion: "reduce", isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  await page.goto(base + path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await prepare?.(page);
  const png = await page.screenshot();
  await sharp(png).webp({ quality: 86 }).toFile(out);
  await ctx.close();
}

await shot("/el-bodegon", { width: 390, height: 844 }, 2, "public/producto/carta.webp", (page) => page.evaluate(() => window.scrollTo(0, 0)));
await shot("/admin/el-bodegon/reservas", { width: 1280, height: 760 }, 1.5, "public/producto/panel.webp");
await shot("/admin/el-bodegon/reservas", { width: 390, height: 844 }, 2, "public/producto/panel-mobile.webp");
await browser.close();
