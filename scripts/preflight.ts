import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { hasErrors, preflight, renderReport, type Target } from "../lib/config/preflight.ts";

// Uso:
//   npm run preflight -- --target=pilot --env-file=.env.pilot
//   npm run preflight -- --target=dev                  (usa el entorno actual)
// El archivo con las variables que pensás cargar en Vercel NO se versiona (.env* está en .gitignore).
// Requiere Node 22.18 o superior (ejecuta TypeScript directo).

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=") as [string, string | undefined]));
const target = (args.get("target") ?? "pilot") as Target;
if (!["pilot", "preview", "dev"].includes(target)) {
  console.error("--target debe ser pilot, preview o dev.");
  process.exit(2);
}

const envFile = args.get("env-file");
let env: Record<string, string | undefined> = process.env;
if (envFile) {
  try {
    env = parseEnv(readFileSync(envFile, "utf8"));
  } catch {
    console.error("No pude leer el archivo indicado en --env-file.");
    process.exit(2);
  }
}

const findings = preflight(env, target);
console.log(renderReport(findings, target));
process.exit(hasErrors(findings) ? 1 : 0);
