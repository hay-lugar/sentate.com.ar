import type { Filters } from "./filters";

// Interpretación de la búsqueda escrita SIN modelos de lenguaje: reconoce términos conocidos del directorio
// (localidades, tipos, cocinas, "abierto ahora", "cerca de mí") y los convierte en filtros visibles y editables.
// Lo ambiguo no se aplica: se le ofrece a la persona para que elija.

export type Facets = {
  localities: { key: string; label: string; province: string }[];
  businessTypes: { code: string; label: string }[];
  cuisines: { code: string; label: string }[];
};

export type Choice =
  | { kind: "locality"; key: string; label: string; province: string }
  | { kind: "business_type"; code: string; label: string }
  | { kind: "cuisine"; code: string; label: string };

export type Interpretation = {
  /** Filtros reconocidos (se suman a los actuales). */
  patch: Partial<Pick<Filters, "locality" | "businessTypes" | "cuisines" | "openNow" | "nearby" | "sort">>;
  /** Texto que no se reconoció: queda como búsqueda libre (nombre, plato…). */
  rest: string;
  /** Términos con más de un significado: la persona decide. */
  ambiguous: { term: string; choices: Choice[] }[];
};

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Singular simple para comparar "pizzas" con "pizza" o "parrillas" con "parrilla". */
const stem = (w: string) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const sameTerm = (a: string, b: string) => stem(norm(a)) === stem(norm(b));

const NEARBY = [/\bcerca de mi\b/, /\bcerca mio\b/, /\bcerca de aca\b/, /\bcercanos?\b/, /\bcerca\b/];
const OPEN = [/\babiertos? ahora\b/, /\babre ahora\b/, /\bahora abiertos?\b/, /\babiertos?\b/];

export function interpretQuery(raw: string, facets: Facets): Interpretation {
  let text = ` ${norm(raw)} `;
  const patch: Interpretation["patch"] = {};
  const ambiguous: Interpretation["ambiguous"] = [];

  for (const re of NEARBY) {
    const m = re.exec(text);
    if (m) {
      patch.nearby = true;
      patch.sort = "distance";
      text = text.replace(re, " ");
      break;
    }
  }
  for (const re of OPEN) {
    if (re.test(text)) {
      patch.openNow = true;
      text = text.replace(re, " ");
      break;
    }
  }

  // Localidad: "en rafaela" o "rafaela" (frases más largas primero: "san justo" antes que "san").
  const localities = [...facets.localities].sort((a, b) => b.key.length - a.key.length);
  for (const loc of localities) {
    const name = norm(loc.label);
    const re = new RegExp(`(?:\\ben\\s+)?\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (!re.test(text)) continue;
    const same = facets.localities.filter((l) => norm(l.label) === name);
    if (same.length > 1) ambiguous.push({ term: loc.label, choices: same.map((l) => ({ kind: "locality", key: l.key, label: l.label, province: l.province })) });
    else patch.locality = loc.key;
    text = text.replace(re, " ");
    break;
  }

  // Tipos y cocinas: cada palabra se compara con las etiquetas del catálogo.
  const words = text.split(" ").filter(Boolean);
  const keep: string[] = [];
  for (const w of words) {
    const bts = facets.businessTypes.filter((b) => sameTerm(b.label, w) || sameTerm(b.code, w));
    const cus = facets.cuisines.filter((c) => sameTerm(c.label, w) || sameTerm(c.code, w));
    const choices: Choice[] = [
      ...bts.map((b) => ({ kind: "business_type" as const, code: b.code, label: b.label })),
      ...cus.map((c) => ({ kind: "cuisine" as const, code: c.code, label: c.label })),
    ];
    if (choices.length === 1) {
      const c = choices[0];
      if (c.kind === "business_type") patch.businessTypes = [...(patch.businessTypes ?? []), c.code];
      else if (c.kind === "cuisine") patch.cuisines = [...(patch.cuisines ?? []), c.code];
    } else if (choices.length > 1) ambiguous.push({ term: w, choices });
    else keep.push(w);
  }

  const stop = new Set(["en", "de", "el", "la", "los", "las", "un", "una", "y", "con", "para", "cerca", "mi"]);
  const rest = keep.filter((w) => !stop.has(w)).join(" ");
  return { patch, rest, ambiguous };
}

/** Aplica una interpretación sobre los filtros actuales (sin duplicar). */
export function applyInterpretation(f: Filters, i: Interpretation): Filters {
  const uniq = (a: string[], b: string[] = []) => [...new Set([...a, ...b])];
  return {
    ...f,
    q: i.rest,
    locality: i.patch.locality ?? f.locality,
    businessTypes: uniq(f.businessTypes, i.patch.businessTypes),
    cuisines: uniq(f.cuisines, i.patch.cuisines),
    openNow: i.patch.openNow ?? f.openNow,
    nearby: i.patch.nearby ?? f.nearby,
    sort: i.patch.sort ?? f.sort,
    page: 1,
  };
}

export function applyChoice(f: Filters, c: Choice): Filters {
  if (c.kind === "locality") return { ...f, locality: c.key, page: 1 };
  if (c.kind === "business_type") return { ...f, businessTypes: [...new Set([...f.businessTypes, c.code])], page: 1 };
  return { ...f, cuisines: [...new Set([...f.cuisines, c.code])], page: 1 };
}
