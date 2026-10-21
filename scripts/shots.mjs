// Capturas de revisión visual (no es parte de la app ni del CI): node scripts/shots.mjs <carpeta> [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = process.argv[2];
const base = process.argv[3] ?? "http://localhost:3600";
mkdirSync(out, { recursive: true });
const widths = [360, 390, 768, 1440];
const pages = [
  ["landing", "/"],
  ["login", "/login"],
  ["registro", "/registro"],
  ["recuperar", "/recuperar"],
  ["carta-bodegon", "/el-bodegon"],
  ["carta-esquina", "/la-esquina"],
  ["carta-sakura", "/sakura"],
  ["panel-inicio", "/admin/el-bodegon"],
  ["panel-reservas", "/admin/el-bodegon/reservas"],
  ["panel-menu", "/admin/el-bodegon/menu"],
  ["panel-ajustes", "/admin/el-bodegon/ajustes"],
  ["panel-qr", "/admin/el-bodegon/qr"],
  ["404", "/no-existe"],
];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w >= 768 ? 900 : 800 }, reducedMotion: "reduce", isMobile: w < 600, hasTouch: w < 600 });
  const page = await ctx.newPage();
  for (const [name, path] of pages) {
    await page.goto(base + path);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity)).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
