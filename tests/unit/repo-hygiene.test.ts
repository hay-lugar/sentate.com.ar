import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Higiene del repositorio para el piloto: sin secretos versionados, fixtures con datos solo ficticios y logs sin
// datos personales. Lee los archivos versionados (`git ls-files`), así que mide lo que realmente se publica.

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" });
const tracked = git("ls-files", "-z").split("\0").filter(Boolean);

const TEXT = /\.(ts|tsx|mjs|js|json|md|sql|toml|ya?ml|css|txt|example)$/;
const SKIP = new Set(["package-lock.json"]);
const read = (file: string) => readFileSync(file, "utf8");
const textFiles = tracked.filter((f) => TEXT.test(f) && !SKIP.has(f));

/** Archivos y líneas (sin el contenido, para no repetir un secreto en el reporte) donde un patrón coincide. */
function hits(pattern: RegExp, files = textFiles): string[] {
  const found: string[] = [];
  for (const file of files) {
    read(file)
      .split("\n")
      .forEach((line, i) => {
        if (pattern.test(line)) found.push(`${file}:${i + 1}`);
      });
  }
  return found;
}

describe("sin secretos versionados", () => {
  it("el único archivo .env versionado es la plantilla", () => {
    expect(tracked.filter((f) => /(^|\/)\.env/.test(f))).toEqual([".env.example"]);
  });

  it.each([".env", ".env.pilot", ".env.production", ".env.preview", ".env.local", ".env.production.local"])("%s está en .gitignore", (name) => {
    expect(() => git("check-ignore", "-q", name)).not.toThrow();
  });

  it("la plantilla .env.example sí se versiona", () => {
    expect(() => git("check-ignore", "-q", ".env.example")).toThrow();
  });

  it("no hay claves secretas de Supabase (sb_secret_…)", () => {
    expect(hits(/sb_secret_[A-Za-z0-9_-]{32,}/)).toEqual([]);
  });

  it("no hay JWT reales (claves legadas, service_role)", () => {
    expect(hits(/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/)).toEqual([]);
  });

  it("no hay URLs de Postgres con usuario y clave", () => {
    expect(hits(/postgres(?:ql)?:\/\/[^:\s@]+:[^@\s]+@/)).toEqual([]);
  });

  it("ningún archivo asigna un valor a un secreto de administración", () => {
    expect(hits(/SUPABASE_(?:DB_PASSWORD|SERVICE_ROLE_KEY|ACCESS_TOKEN|SECRET_KEY)\s*=\s*[^\s#]/)).toEqual([]);
  });
});

describe("fixtures y seed: solo datos ficticios", () => {
  const dataFiles = ["data/fixtures.ts", "supabase/seed.sql", ...tracked.filter((f) => /^supabase\/tests\/database\/.*\.sql$/.test(f))];

  it("todo teléfono +54 de los fixtures usa 11 0000-NNNN, que no puede pertenecer a nadie", () => {
    // Un abonado de AMBA no empieza con 0: estos números son imposibles. Un número "de aspecto real" podría ser de una
    // persona, y los teléfonos de los comercios de la demo se muestran como enlaces tel: públicos. Se compara por
    // dígitos: el formato (paréntesis, guiones) es libre porque algunas pruebas lo ejercitan a propósito.
    const bad: string[] = [];
    for (const file of dataFiles) {
      for (const m of read(file).matchAll(/\+54[\d\s().-]*/g)) {
        const digits = m[0].replace(/\D/g, "");
        if (digits.length >= 8 && !/^54110000\d{4}$/.test(digits)) bad.push(`${file}: ${m[0].trim().slice(0, 6)}…`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("los teléfonos locales de las pruebas y el seed (11 NNNN NNNN) también son del rango imposible 0000", () => {
    // Excluye los IDs de fotos de Unsplash (photo-1563805042-…): van precedidos y seguidos de guion.
    const LOCAL = /(?<![\d-])(?:11|15)[ -]?(\d{4})[ -]?(\d{4})(?![\d-])/g;
    const files = [...new Set([...dataFiles.filter((f) => f !== "data/fixtures.ts"), ...tracked.filter((f) => /^(tests|supabase\/tests)\/.*\.(ts|mjs|sql)$/.test(f))])];
    const bad: string[] = [];
    for (const file of files) {
      for (const m of read(file).matchAll(LOCAL)) if (m[1] !== "0000") bad.push(`${file}: ${m[0].trim().slice(0, 5)}…`);
    }
    expect(bad).toEqual([]);
  });

  it("los fixtures y el seed incluyen teléfonos de ejemplo (la comprobación anterior no es vacía)", () => {
    expect(read("data/fixtures.ts")).toMatch(/\+54 11 0000-\d{4}/);
    expect(read("supabase/seed.sql")).toMatch(/\+54 11 0000-\d{4}/);
  });

  it("todo email de los fixtures es de un dominio reservado para pruebas", () => {
    const allowed = /@(example\.(test|com|org|net)|test\.local|invalid)$/i;
    const bad: string[] = [];
    for (const file of dataFiles) {
      for (const m of read(file).matchAll(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z0-9._+-]+@test\.local/g)) {
        if (!allowed.test(m[0])) bad.push(`${file}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("logs sin datos personales", () => {
  const sourceFiles = tracked.filter((f) => /^(app|lib|components|utils)\/.*\.(ts|tsx)$/.test(f) || f === "proxy.ts");
  const SENSITIVE = /password|token|phone|notes|email|secret|\breq\b|\binput\b|\bbody\b/i;

  it("ningún console.* menciona un dato sensible sin pasar por redact()", () => {
    const bad: string[] = [];
    for (const file of sourceFiles) {
      read(file)
        .split("\n")
        .forEach((line, i) => {
          if (/console\.(log|info|warn|error|debug)\(/.test(line) && SENSITIVE.test(line) && !line.includes("redact(")) bad.push(`${file}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });

  it("los console.error que reciben un mensaje de error externo pasan por redact()", () => {
    const bad: string[] = [];
    for (const file of sourceFiles) {
      read(file)
        .split("\n")
        .forEach((line, i) => {
          if (/console\.error\(/.test(line) && /\.message\b/.test(line) && !line.includes("redact(")) bad.push(`${file}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
