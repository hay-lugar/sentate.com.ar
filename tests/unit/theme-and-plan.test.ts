import { describe, expect, it } from "vitest";
import { listTenantSlugs, getTenantRecord } from "@/lib/data/tenants";
import { PLAN, planPriceFullLabel, planPriceLabel, trialLongLabel } from "@/lib/config/plan";
import { contrastRatio, readableOn, themeContrastReport } from "@/lib/theme";
import { getSimulationMode, simulateRequest } from "@/lib/demo/simulate";

describe("contraste de los temas de ejemplo (WCAG AA)", () => {
  it.each(listTenantSlugs())("%s cumple 4.5:1 en todos los pares de texto", (slug) => {
    const report = themeContrastReport(getTenantRecord(slug)!.profile.theme);
    for (const c of report) expect(c.ratio, `${slug}: ${c.label}`).toBeGreaterThanOrEqual(4.5);
  });

  it("readableOn elige el texto de mayor contraste", () => {
    expect(readableOn("#111111")).toBe("#ffffff");
    expect(readableOn("#ffee88")).toBe("#17130f");
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});

describe("modelo comercial", () => {
  it("prueba de 30 días sin tarjeta y $14.999 ARS por mes", () => {
    expect(PLAN).toMatchObject({ trialDays: 30, priceMonthly: 14999, currency: "ARS", trialRequiresCard: false });
    expect(planPriceLabel).toBe("$14.999");
    expect(planPriceFullLabel).toBe("$14.999 ARS por mes");
    expect(trialLongLabel).toBe("30 días gratis, sin tarjeta");
  });
});

describe("simulación de red", () => {
  it("lee el modo desde el query param", () => {
    expect(getSimulationMode("?simular=error")).toBe("error");
    expect(getSimulationMode("?simular=lento")).toBe("lento");
    expect(getSimulationMode("?simular=otra")).toBe("ok");
  });

  it("falla en modo error y se cancela al abortar (sin temporizadores colgados)", async () => {
    await expect(simulateRequest(new AbortController().signal, "error")).rejects.toThrow(/simulado/);
    const c = new AbortController();
    const p = simulateRequest(c.signal, "lento");
    c.abort(new Error("cerrado"));
    await expect(p).rejects.toThrow("cerrado");
  });
});

describe("precio en la base", () => {
  it("la última migración que fija price_monthly coincide con PLAN.priceMonthly", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = "supabase/migrations";
    const values = readdirSync(dir)
      .sort()
      .flatMap((f) => [...readFileSync(`${dir}/${f}`, "utf8").matchAll(/price_monthly(?: numeric\(12, 2\) not null)?(?: set)? default (\d+)|price_monthly = (\d+)/g)].map((m) => Number(m[1] ?? m[2])));
    expect(values.at(-1)).toBe(PLAN.priceMonthly);
  });
});
