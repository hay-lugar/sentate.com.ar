// Auditoría visual automática (no es parte de la app ni del CI): node scripts/audit-visual.mjs <carpeta> [baseUrl]
// Para cada página y ancho: captura a página completa (tras recorrerla, para cargar imágenes diferidas) y mide
// desborde horizontal, áreas táctiles < 44px, texto < 13px, imágenes sin alt, h1 y un único <main>.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const out = process.argv[2];
const base = process.argv[3] ?? "http://localhost:3600";
mkdirSync(out, { recursive: true });
const widths = [360, 390, 768, 1440];
const pages = (process.env.PAGES ? JSON.parse(process.env.PAGES) : [
  ["landing", "/"], ["login", "/login"], ["registro", "/registro"], ["recuperar", "/recuperar"],
  ["carta-bodegon", "/el-bodegon"], ["carta-sakura", "/sakura"], ["explorar", "/explorar"],
  ["panel-inicio", "/admin/el-bodegon"], ["panel-reservas", "/admin/el-bodegon/reservas"], ["panel-menu", "/admin/el-bodegon/menu"],
  ["panel-ajustes", "/admin/el-bodegon/ajustes"], ["panel-qr", "/admin/el-bodegon/qr"], ["404", "/no-existe"],
]);

const measure = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("href") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
  const small = [];
  for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, summary, [role=button], [role=tab]")) {
    if (!vis(el) || el.closest("[aria-hidden=true]") || el.getBoundingClientRect().width <= 1) continue; // <=1px: entrada de archivo oculta (sr-only)
    if (el.tagName === "A" && el.closest("p, li") && getComputedStyle(el).display === "inline") continue; // enlace en línea dentro de texto
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) small.push(`${el.tagName.toLowerCase()} «${label(el)}» ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const tiny = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12.99) tiny.add(`${fs}px «${label(el)}»`);
  }
  return {
    overflow: document.documentElement.scrollWidth - innerWidth,
    small: [...new Set(small)].slice(0, 12),
    tiny: [...tiny].slice(0, 8),
    noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length,
    h1: document.querySelectorAll("h1").length,
    mains: document.querySelectorAll("main").length,
  };
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const report = {};
for (const w of widths) {
  const ctx = await browser.newContext({ colorScheme: process.env.SCHEME || "light", viewport: { width: w, height: w >= 768 ? 900 : 800 }, reducedMotion: "reduce", isMobile: w < 600, hasTouch: w < 600 });
  if (process.env.FONT_PX) await ctx.addInitScript((px) => { document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.fontSize = px + "px"; }); }, process.env.FONT_PX);
  const page = await ctx.newPage();
  for (const [name, path] of pages) {
    await page.goto(base + path);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
    await page.waitForTimeout(500);
    report[`${name}-${w}`] = await page.evaluate(measure);
    await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/reporte.json`, JSON.stringify(report, null, 1));
for (const [k, v] of Object.entries(report)) {
  const issues = [v.overflow > 0 && `desborde ${v.overflow}px`, v.small.length && `táctil<44: ${v.small.length}`, v.tiny.length && `texto<13: ${v.tiny.length}`, v.noAlt && `sin alt: ${v.noAlt}`, v.h1 !== 1 && `h1=${v.h1}`, v.mains !== 1 && `main=${v.mains}`].filter(Boolean);
  if (issues.length) console.log(k, issues.join(" | "));
}
