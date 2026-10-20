import { execSync } from "node:child_process";

/** Base local limpia y con los fixtures de desarrollo antes de cada corrida. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_DB_RESET) return;
  execSync("npx -y supabase@2.121.0 db reset", { stdio: "inherit" });
}
