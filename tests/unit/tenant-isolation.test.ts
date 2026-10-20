import { describe, expect, it } from "vitest";
import { getPublicTenant, getTenantRecord, listTenantSlugs } from "@/lib/data/tenants";
import { demoReducer, type DemoState } from "@/lib/demo/state";
import { clearDemo, demoStorageKey, loadDemo, saveDemo } from "@/lib/demo/storage";
import { toPublicTenant } from "@/lib/domain/public";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const stateFor = (slug: string): DemoState => {
  const r = getTenantRecord(slug)!;
  return { slug, profile: r.profile, categories: r.categories, reservations: r.reservations };
};

describe("consultas de tenants", () => {
  it("resuelve slugs existentes y devuelve undefined para inválidos", () => {
    expect(listTenantSlugs()).toEqual(["el-bodegon", "la-esquina", "sakura"]);
    expect(getTenantRecord("no-existe")).toBeUndefined();
    expect(getPublicTenant("no-existe")).toBeUndefined();
  });

  it("devuelve copias: mutar un resultado no afecta la próxima consulta", () => {
    const a = getTenantRecord("el-bodegon")!;
    a.profile.name = "Mutado";
    a.categories.length = 0;
    expect(getTenantRecord("el-bodegon")!.profile.name).toBe("El Bodegón");
  });
});

describe("contrato público", () => {
  it("solo expone campos permitidos", () => {
    const pub = getPublicTenant("el-bodegon")!;
    expect(Object.keys(pub).sort()).toEqual(
      ["address", "categories", "coverImage", "cuisine", "logoUrl", "name", "phone", "priceRange", "schedule", "slug", "tagline", "theme", "timezone"].sort(),
    );
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/reservations|stats|receivedMinutesAgo|Martina/);
    expect(Object.keys(pub.categories[0].dishes[0]).sort()).toEqual(["description", "id", "image", "name", "price", "tags"]);
  });

  it("excluye platos inactivos y categorías vacías", () => {
    const pub = getPublicTenant("el-bodegon")!;
    expect(pub.categories.flatMap((c) => c.dishes).some((d) => d.id === "bondiola")).toBe(false);
    expect(getPublicTenant("sakura")!.categories.some((c) => c.id === "postres")).toBe(false);
  });

  it("no filtra campos extra que se agreguen al perfil privado", () => {
    const r = getTenantRecord("sakura")!;
    const profile = { ...r.profile, internalNotes: "secreto" } as typeof r.profile;
    expect(JSON.stringify(toPublicTenant(r.slug, profile, r.categories))).not.toContain("secreto");
  });
});

describe("almacenamiento de demo aislado por tenant", () => {
  it("usa claves versionadas distintas por tenant", () => {
    expect(demoStorageKey("el-bodegon")).toBe("sentate:demo:v1:el-bodegon");
    expect(demoStorageKey("sakura")).not.toBe(demoStorageKey("el-bodegon"));
  });

  it("los cambios de un tenant no aparecen en otro", () => {
    const storage = memoryStorage();
    const a = demoReducer(stateFor("el-bodegon"), { type: "addCategory", name: "Solo en A" });
    saveDemo("el-bodegon", a, storage);
    expect(loadDemo("el-bodegon", storage)!.categories.some((c) => c.name === "Solo en A")).toBe(true);
    expect(loadDemo("sakura", storage)).toBeNull();
  });

  it("rechaza datos guardados bajo otro slug o con otra versión", () => {
    const storage = memoryStorage();
    saveDemo("el-bodegon", stateFor("el-bodegon"), storage);
    storage.setItem(demoStorageKey("sakura"), storage.getItem(demoStorageKey("el-bodegon"))!);
    expect(loadDemo("sakura", storage)).toBeNull();

    const raw = JSON.parse(storage.getItem(demoStorageKey("el-bodegon"))!);
    storage.setItem(demoStorageKey("el-bodegon"), JSON.stringify({ ...raw, version: 0 }));
    expect(loadDemo("el-bodegon", storage)).toBeNull();
    storage.setItem(demoStorageKey("el-bodegon"), "{no es json");
    expect(loadDemo("el-bodegon", storage)).toBeNull();
  });

  it("nunca persiste reservas ni datos de clientes", () => {
    const storage = memoryStorage();
    saveDemo("el-bodegon", stateFor("el-bodegon"), storage);
    const raw = storage.getItem(demoStorageKey("el-bodegon"))!;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["categories", "profile", "savedAt", "slug", "version"]);
    expect(raw).not.toMatch(/reservations|Martina|5523-8812|Cumpleaños/);
  });

  it("restablecer borra solo el tenant indicado", () => {
    const storage = memoryStorage();
    saveDemo("el-bodegon", stateFor("el-bodegon"), storage);
    saveDemo("sakura", stateFor("sakura"), storage);
    clearDemo("el-bodegon", storage);
    expect(loadDemo("el-bodegon", storage)).toBeNull();
    expect(loadDemo("sakura", storage)).not.toBeNull();
  });

  it("si el storage falla, informa en lugar de romper", () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
    expect(saveDemo("el-bodegon", stateFor("el-bodegon"), broken)).toBe(false);
  });
});

describe("reset del estado de demo", () => {
  it("vuelve a los datos de ejemplo del tenant", () => {
    const initial = stateFor("la-esquina");
    let s = demoReducer(initial, { type: "updateProfile", profile: { ...initial.profile, name: "Otro" } });
    s = demoReducer(s, { type: "setReservationStatus", id: "r-201", status: "confirmed" });
    s = demoReducer(s, { type: "reset", initial });
    expect(s.profile.name).toBe("La Esquina");
    expect(s.reservations.find((r) => r.id === "r-201")!.status).toBe("pending");
  });
});
