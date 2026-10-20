import { defineConfig, devices } from "@playwright/test";

// E2E contra un Supabase LOCAL real (supabase start). Build separado en .next-live.
// Uso: npm run test:e2e:live   (resetea la base local con supabase/seed.sql antes de correr)
const PORT = Number(process.env.E2E_LIVE_PORT ?? 3300);
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
// Clave publicable por defecto del stack local de la CLI (no es un secreto de producción).
const SUPABASE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

export default defineConfig({
  testDir: "tests/e2e-live",
  globalSetup: "./tests/e2e-live/global-setup.ts",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
    timezoneId: "America/Argentina/Buenos_Aires",
    locale: "es-AR",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `next build && next start -p ${PORT}`,
    port: PORT,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_DIST_DIR: ".next-live",
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY,
      // Enlaces de email (alta y recuperación) apuntan al puerto del servidor de prueba.
      APP_URL: `http://localhost:${PORT}`,
    },
  },
});
