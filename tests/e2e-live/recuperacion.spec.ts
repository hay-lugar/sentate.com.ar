import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Recuperación de contraseña contra Supabase LOCAL + Mailpit. Usuario dedicado de supabase/seed.sql
// (recuperacion@example.test, sin comercio), así que cambiar su clave no afecta a los demás tests.

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const KNOWN = "recuperacion@example.test";
const NEW_PASSWORD = "clave-nueva-2026";
const NEUTRAL = /Si hay una cuenta con ese email/;
const LINK_ERROR = /no es válido, venció o ya se usó/;

/** Enlace de recuperación del último email a `email`. El host del enlace es el SiteURL local; se usa solo el path. */
async function recoveryLink(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { HTML: string; Text: string };
      const link = (msg.HTML + msg.Text).match(/https?:\/\/[^\s"'<>]+\/auth\/callback\?[^\s"'<>]+/)?.[0];
      if (link) {
        const url = new URL(link.replaceAll("&amp;", "&"));
        return `${url.pathname}${url.search}`;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No llegó el email de recuperación a ${email}`);
}

async function requestReset(page: Page, email: string) {
  await page.goto("/recuperar");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enviarme el enlace" }).click();
}

test.describe("recuperación de contraseña", () => {
  test("el login ofrece 'Olvidé mi contraseña'", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Olvidé mi contraseña" }).click();
    await expect(page).toHaveURL(/\/recuperar$/);
  });

  test("respuesta neutral: igual para una cuenta inexistente y para una existente", async ({ page }) => {
    await requestReset(page, "nadie-asi@example.test");
    await expect(page.getByRole("status").filter({ hasText: NEUTRAL })).toBeVisible();

    await requestReset(page, KNOWN);
    await expect(page.getByRole("status").filter({ hasText: NEUTRAL })).toBeVisible();
  });

  test("tras pedir el enlace, el botón queda deshabilitado con cuenta regresiva", async ({ page }) => {
    await requestReset(page, KNOWN);
    await expect(page.getByRole("status").filter({ hasText: NEUTRAL })).toBeVisible();
    await expect(page.getByRole("button", { name: /Podés pedir otro enlace en \d+ s/ })).toBeDisabled();
  });

  test("flujo completo: enlace del email → contraseña nueva → ingreso con la clave nueva", async ({ page, browser }) => {
    await requestReset(page, KNOWN);
    const link = await recoveryLink(KNOWN);
    await page.goto(link);

    await expect(page).toHaveURL(/\/recuperar\/nueva$/);
    await page.getByLabel("Contraseña nueva").fill(NEW_PASSWORD);
    await page.getByLabel("Repetí la contraseña").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    const ctx = await browser.newContext();
    const fresh = await ctx.newPage();
    await fresh.goto("/login");
    await fresh.getByLabel("Email").fill(KNOWN);
    await fresh.getByLabel("Contraseña").fill(NEW_PASSWORD);
    await fresh.getByRole("button", { name: "Ingresar" }).click();
    await expect(fresh).toHaveURL(/\/admin$/);
    await ctx.close();
  });

  test("enlace reutilizado: no vuelve a funcionar y pide uno nuevo", async ({ page }) => {
    await requestReset(page, KNOWN);
    const link = await recoveryLink(KNOWN);
    // Primer uso: lo canjea y guarda una clave (la misma que el test anterior, sin importar el orden).
    await page.goto(link);
    await page.getByLabel("Contraseña nueva").fill(NEW_PASSWORD);
    await page.getByLabel("Repetí la contraseña").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // Segundo uso del mismo enlace.
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page).toHaveURL(/\/recuperar\?error=enlace$/);
    await expect(page.getByRole("alert").filter({ hasText: LINK_ERROR })).toBeVisible();
  });

  test("enlace inválido o vencido: vuelve a /recuperar con mensaje accesible", async ({ page }) => {
    await page.goto("/auth/callback?token_hash=invalido&type=recovery&next=/recuperar/nueva");
    await expect(page).toHaveURL(/\/recuperar\?error=enlace$/);
    await expect(page.getByRole("alert").filter({ hasText: LINK_ERROR })).toBeVisible();
  });

  test("tipo de OTP no previsto se rechaza", async ({ page }) => {
    await page.goto("/auth/callback?token_hash=abc&type=email_change&next=/recuperar/nueva");
    await expect(page).toHaveURL(/\/recuperar\?error=enlace$/);
  });

  test("sin sesión, /recuperar/nueva no muestra el formulario", async ({ page }) => {
    await page.goto("/recuperar/nueva");
    await expect(page.getByRole("heading", { name: "No pudimos validar el enlace" })).toBeVisible();
    await expect(page.getByLabel("Contraseña nueva")).toHaveCount(0);
  });

  test("contraseñas que no coinciden y menos de 8 caracteres: el servidor lo rechaza", async ({ page }) => {
    await requestReset(page, KNOWN);
    await page.goto(await recoveryLink(KNOWN));
    await page.getByLabel("Contraseña nueva").fill("corta");
    await page.getByLabel("Repetí la contraseña").fill("corta");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("alert")).toContainText("al menos 8");

    await page.getByLabel("Contraseña nueva").fill("clave-larga-1");
    await page.getByLabel("Repetí la contraseña").fill("clave-larga-2");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("alert")).toContainText("no coinciden");
  });

});

test.describe("accesibilidad de recuperación", () => {
  // axe mide el estado final: se espera a que terminen las animaciones de entrada.
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  for (const path of ["/recuperar", "/recuperar?error=enlace"]) {
    test(`${path}: sin violaciones serias de a11y`, async ({ page }) => {
      await page.goto(path);
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === "finished" || a.playState === "idle"));
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => v.id)).toEqual([]);
    });
  }
});
