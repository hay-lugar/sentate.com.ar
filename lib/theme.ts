import type { CSSProperties } from "react";
import type { TenantTheme } from "@/lib/domain/types";

/** Inyecta la paleta del tenant como CSS vars; Tailwind las consume vía `bg-brand`, etc. */
export function themeStyle(theme: TenantTheme): CSSProperties {
  return {
    "--brand": theme.primary,
    "--brand-fg": theme.primaryForeground,
    "--accent": theme.accent,
    "--accent-fg": theme.accentForeground,
  } as CSSProperties;
}

const HEX_RE = /^#([0-9a-f]{6})$/i;
export const isHexColor = (s: string) => HEX_RE.test(s);

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2.x entre dos colores hex. */
export function contrastRatio(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export const INK = "#17130f";
export const WHITE = "#ffffff";

/** Elige blanco o tinta según qué contraste mejor sobre el fondo. */
export const readableOn = (bg: string) => (contrastRatio(bg, WHITE) >= contrastRatio(bg, INK) ? WHITE : INK);

/** Mezcla `hex` con blanco (equivalente aproximado a color-mix en sRGB). */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export type ContrastCheck = { label: string; ratio: number; ok: boolean };

/** Pares de color que usa la UI con texto. AA: 4.5 para texto normal. */
export function themeContrastReport(theme: TenantTheme, background = "#ffffff"): ContrastCheck[] {
  const pairs: [string, string, string][] = [
    ["Texto sobre botón", theme.primaryForeground, theme.primary],
    ["Texto de acento", theme.accentForeground, theme.accent],
    ["Color de marca sobre fondo", theme.primary, background],
    ["Marca sobre tinte suave", theme.primary, tint(theme.primary, 0.09)],
  ];
  return pairs.map(([label, fg, bg]) => {
    const ratio = contrastRatio(fg, bg);
    return { label, ratio, ok: ratio >= 4.5 };
  });
}
