import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Recuperación de contraseña contra Supabase LOCAL + Mailpit. Usuario dedicado de supabase/seed.sql
// (recuperacion@example.test, SIN comercio), así que cambiar su clave no afecta a los demás tests.
// Un usuario sin comercio termina en su cuenta (nunca en el alta de un local) tras guardar la clave.

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const KNOWN = "recuperacion@example.test";
const NEW_PASSWORD = "clave-nueva-2026";
// Supabase rechaza una contraseña igual a la actual: cada test que guarda una usa la suya.
const SECOND_PASSWORD = "clave-otra-2026-b";
const NEUTRAL = /Si hay una cuenta con ese email/;
const LINK_ERROR = /no es válido, venció o ya se usó/;
const AFTER_SAVE = /\/cuenta$/;

type MailMessage = { ID: string };

async function mailIds(email: string): Promise<Set<string>> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const { messages } = (await res.json()) as { messages?: MailMessage[] };
  return new Set((messages ?? []).map((m) => m.ID));
}

/**
 * Enlace de recuperación del email NUEVO enviado a `email`: espera un mensaje cuyo ID no estaba en `before`.
 * Tomar "el último que haya" puede devolver un email viejo (con el token ya usado) antes de que llegue el nuevo.
 * El host del enlace es el SiteURL local; se usa solo el path.
 */
async function newRecoveryLink(email: string, before: Set<string>, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await res.json()) as { messages?: MailMessage[] };
    const fresh = (messages ?? []).find((m) => !before.has(m.ID));
    if (fresh) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as { HTML: string; Text: string };
      const link = (msg.HTML + msg.Text).match(/https?:\/\/[^\s"'<>]+\/auth\/callback\?[^\s"'<>]+/)?.[0];
      if (link) {
        const url = new URL(link.replaceAll("&amp;", "&"));
        return `${url.pathname}${url.search}`;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No llegó un email de recuperación nuevo a ${email}`);
}

async function requestReset(page: Page, email: string) {
  await page.goto("/recuperar");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enviarme el enlace" }).click();
}

/**
 * Pide el enlace y devuelve el path del email nuevo.
 * Auth rechaza un segundo pedido del mismo usuario dentro de max_frequency (1 s en local) y la app responde
 * igual de neutral, sin enviar nada. Si no llega un email nuevo, se vuelve a pedir tras esa ventana.
 */
async function requestAndGetLink(page: Page, email: string): Promise<string> {
  const attempts = 3;
  for (let attempt = 1; ; attempt++) {
    const before = await mailIds(email);
    await requestReset(page, email);
    await expect(page.getByRole("status").filter({ hasText: NEUTRAL })).toBeVisible();
    try {
      return await newRecoveryLink(email, before, 6_000);
    } catch (error) {
      if (attempt === attempts) throw error;
      await page.waitForTimeout(1_500);
    }
  }
}

async function saveNewPassword(page: Page, password: string, confirm = password) {
  await page.getByLabel("Contraseña nueva").fill(password);
  await page.getByLabel("Repetí la contraseña").fill(confirm);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
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
    await page.goto(await requestAndGetLink(page, KNOWN));

    await expect(page).toHaveURL(/\/recuperar\/nueva$/);
    await saveNewPassword(page, NEW_PASSWORD);
    await expect(page).toHaveURL(AFTER_SAVE);

    // La clave nueva sirve para ingresar desde cero; la anterior ya no.
    const ctx = await browser.newContext();
    const fresh = await ctx.newPage();
    await fresh.goto("/login");
    await fresh.getByLabel("Email").fill(KNOWN);
    await fresh.getByLabel("Contraseña").fill(NEW_PASSWORD);
    await fresh.getByRole("button", { name: "Ingresar" }).click();
    await expect(fresh).toHaveURL(AFTER_SAVE);

    const old = await browser.newContext();
    const oldPage = await old.newPage();
    await oldPage.goto("/login");
    await oldPage.getByLabel("Email").fill(KNOWN);
    await oldPage.getByLabel("Contraseña").fill("sentate-dev-only");
    await oldPage.getByRole("button", { name: "Ingresar" }).click();
    await expect(oldPage.getByRole("alert").filter({ hasText: "Email o contraseña incorrectos" })).toBeVisible();
    await ctx.close();
    await old.close();
  });

  test("enlace reutilizado: no vuelve a funcionar y pide uno nuevo", async ({ page }) => {
    const link = await requestAndGetLink(page, KNOWN);
    // Primer uso: lo canjea y guarda una clave.
    await page.goto(link);
    await saveNewPassword(page, SECOND_PASSWORD);
    await expect(page).toHaveURL(AFTER_SAVE);

    // Segundo uso del mismo enlace, sin la sesión del primero.
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
    await page.goto(await requestAndGetLink(page, KNOWN));
    await expect(page).toHaveURL(/\/recuperar\/nueva$/);

    await saveNewPassword(page, "corta");
    await expect(page.getByRole("alert").filter({ hasText: "al menos 8" })).toBeVisible();

    await saveNewPassword(page, "clave-larga-1", "clave-larga-2");
    await expect(page.getByRole("alert").filter({ hasText: "no coinciden" })).toBeVisible();
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
