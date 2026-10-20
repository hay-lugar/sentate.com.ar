import { describe, expect, it } from "vitest";
import { liveMutation } from "@/lib/admin/live-mutations";
import { validateDishForm } from "@/lib/demo/menu-validation";
import { IMAGE_LIMITS, KIND_SPECS } from "@/lib/images/config";
import { buildImagePath, imageRefProblem, isImagePath, parseImagePath } from "@/lib/images/paths";
import { resolveImageRef } from "@/lib/images/sign";
import { sniffImageType } from "@/lib/images/sniff";
import { fitWithin, limitsHint, validateDimensions, validateSource } from "@/lib/images/validate";

const bytes = (...v: number[]) => Uint8Array.from(v);
const text = (s: string) => new TextEncoder().encode(s);
const MB = 1024 * 1024;

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const WEBP = Uint8Array.from([...text("RIFF"), 1, 2, 3, 4, ...text("WEBP")]);

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const TENANT_HEX = "abcdefab-abcd-4abc-8abc-abcdefabcdef"; // con letras: la mayúscula sí cambia el texto
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("sniffImageType: el tipo sale del contenido, no de la extensión", () => {
  it("reconoce JPEG, PNG y WebP", () => {
    expect(sniffImageType(JPEG)).toBe("jpeg");
    expect(sniffImageType(PNG)).toBe("png");
    expect(sniffImageType(WEBP)).toBe("webp");
  });

  it("detecta SVG aunque venga con BOM, prólogo XML o espacios", () => {
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("svg");
    expect(sniffImageType(text('﻿<?xml version="1.0"?><svg/>'))).toBe("svg");
    expect(sniffImageType(text('   \n<SVG onload="alert(1)">'))).toBe("svg");
  });

  it("detecta GIF y HEIC", () => {
    expect(sniffImageType(text("GIF89a......"))).toBe("gif");
    expect(sniffImageType(Uint8Array.from([0, 0, 0, 24, ...text("ftypheic")]))).toBe("heic");
  });

  it("un archivo que no es imagen es desconocido", () => {
    expect(sniffImageType(text("%PDF-1.7"))).toBe("unknown");
    expect(sniffImageType(new Uint8Array(0))).toBe("unknown");
  });
});

describe("validateSource", () => {
  it("acepta imágenes JPG, PNG y WebP dentro del límite", () => {
    expect(validateSource({ size: 2 * MB, head: JPEG })).toBeNull();
    expect(validateSource({ size: 2 * MB, head: PNG })).toBeNull();
    expect(validateSource({ size: 2 * MB, head: WEBP })).toBeNull();
  });

  it("rechaza SVG y GIF con un mensaje claro, aunque el navegador diga que es una imagen", () => {
    expect(validateSource({ size: 1000, head: text("<svg></svg>") })).toMatch(/SVG/);
    expect(validateSource({ size: 1000, head: text("GIF89a") })).toMatch(/GIF/);
    expect(validateSource({ size: 1000, head: text("%PDF-1.7") })).toMatch(/no es una imagen/);
  });

  it("rechaza HEIC con instrucciones", () => {
    expect(validateSource({ size: 1000, head: Uint8Array.from([0, 0, 0, 24, ...text("ftypheic")]) })).toMatch(/HEIC/);
  });

  it("rechaza archivos vacíos y demasiado pesados", () => {
    expect(validateSource({ size: 0, head: JPEG })).toMatch(/vacío/);
    expect(validateSource({ size: IMAGE_LIMITS.maxSourceBytes + 1, head: JPEG })).toMatch(/más de 15 MB/);
    expect(validateSource({ size: IMAGE_LIMITS.maxSourceBytes, head: JPEG })).toBeNull();
  });
});

describe("validateDimensions", () => {
  it("acepta lo que cumple el mínimo del tipo", () => {
    expect(validateDimensions("logo", 128, 128)).toBeNull();
    expect(validateDimensions("cover", 640, 320)).toBeNull();
    expect(validateDimensions("dish", 4000, 3000)).toBeNull();
  });

  it("rechaza imágenes más chicas que el mínimo, con el tamaño pedido", () => {
    expect(validateDimensions("logo", 100, 200)).toMatch(/128×128/);
    expect(validateDimensions("cover", 639, 400)).toMatch(/640×320/);
    expect(validateDimensions("dish", 200, 200)).toMatch(/320×320/);
  });

  it("rechaza dimensiones inválidas y bombas de descompresión", () => {
    expect(validateDimensions("dish", 0, 500)).toMatch(/dimensiones/);
    expect(validateDimensions("dish", Number.NaN, 500)).toMatch(/dimensiones/);
    expect(validateDimensions("dish", 10_000, 6_000)).toMatch(/demasiado grande/);
  });
});

describe("fitWithin", () => {
  it("achica manteniendo la proporción", () => {
    expect(fitWithin(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 });
  });
  it("nunca agranda", () => {
    expect(fitWithin(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });
  it("no devuelve lados en cero", () => {
    expect(fitWithin(10_000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
  it("los topes de cada tipo coinciden con la configuración", () => {
    expect(fitWithin(5000, 5000, KIND_SPECS.logo.maxSide).width).toBe(512);
  });
});

describe("limitsHint", () => {
  it("comunica formatos, peso máximo y mínimo de cada tipo", () => {
    expect(limitsHint("dish")).toBe("JPG, PNG o WebP · hasta 15 MB · mínimo 320×320 px. Se optimiza antes de subir.");
    expect(limitsHint("cover")).toContain("640×320");
  });
});

describe("rutas de imágenes: aisladas por comercio y sin colisiones", () => {
  it("buildImagePath arma <tenant>/<tipo>/<uuid>.<ext> y la ruta se vuelve a leer", () => {
    const path = buildImagePath(TENANT_A, "dish", "webp", ID);
    expect(path).toBe(`${TENANT_A}/dish/${ID}.webp`);
    expect(parseImagePath(path)).toEqual({ tenantId: TENANT_A, kind: "dish", id: ID, ext: "webp" });
  });

  it("cada subida lleva un nombre distinto", () => {
    expect(buildImagePath(TENANT_A, "logo", "jpg")).not.toBe(buildImagePath(TENANT_A, "logo", "jpg"));
  });

  it("rechaza tenants inválidos al construir", () => {
    expect(() => buildImagePath("no-es-uuid", "dish", "webp")).toThrow();
  });

  it.each([
    "../otro/dish/x.webp",
    `${TENANT_A}/dish/${ID}.svg`,
    `${TENANT_A}/dish/${ID}.gif`,
    `${TENANT_A}/doc/${ID}.webp`,
    `${TENANT_A}/dish/${ID}.webp/extra`,
    `/${TENANT_A}/dish/${ID}.webp`,
    `${TENANT_HEX.toUpperCase()}/dish/${ID}.webp`,
    "https://evil.example/x.webp",
    "data:image/png;base64,AAAA",
  ])("no es una ruta válida: %s", (value) => {
    expect(isImagePath(value)).toBe(false);
  });

  it("acepta webp y jpg", () => {
    expect(isImagePath(`${TENANT_A}/cover/${ID}.jpg`)).toBe(true);
  });
});

describe("imageRefProblem: una referencia solo puede apuntar a imágenes propias", () => {
  it("acepta vacío, URLs https (demos) y rutas propias del tipo correcto", () => {
    expect(imageRefProblem(null, TENANT_A, "dish")).toBeNull();
    expect(imageRefProblem("https://images.unsplash.com/x", TENANT_A, "dish")).toBeNull();
    expect(imageRefProblem(`${TENANT_A}/dish/${ID}.webp`, TENANT_A, "dish")).toBeNull();
  });

  it("rechaza la ruta de OTRO comercio (aislamiento)", () => {
    expect(imageRefProblem(`${TENANT_B}/dish/${ID}.webp`, TENANT_A, "dish")).toMatch(/otro comercio/);
  });

  it("rechaza una ruta de otro tipo", () => {
    expect(imageRefProblem(`${TENANT_A}/logo/${ID}.webp`, TENANT_A, "dish")).toMatch(/no corresponde/);
  });

  it("rechaza data URLs, http y basura", () => {
    expect(imageRefProblem("data:image/png;base64,AAAA", TENANT_A, "logo")).toMatch(/no es válida/);
    expect(imageRefProblem("http://x.test/a.png", TENANT_A, "logo")).toMatch(/no es válida/);
    expect(imageRefProblem("cualquier cosa", TENANT_A, "logo")).toMatch(/no es válida/);
  });
});

describe("contrato de mutaciones con imágenes", () => {
  const profile = {
    name: "Mi local",
    tagline: "",
    cuisine: "Cocina",
    priceRange: "$$",
    address: "Calle 123",
    phone: "11 0000 5555",
    timezone: "America/Argentina/Buenos_Aires",
    theme: { primary: "#b8461b", primaryForeground: "#ffffff", accent: "#f7e6d4", accentForeground: "#6b2a10" },
  };

  it("el perfil acepta una ruta de Storage o una URL https como logo, y null", () => {
    for (const logoUrl of [`${TENANT_A}/logo/${ID}.webp`, "https://example.com/logo.png", null]) {
      expect(liveMutation.safeParse({ type: "saveSettings", expectedVersion: "2026-10-20T10:00:00Z", profile: { ...profile, logoUrl }, schedule: null }).success).toBe(true);
    }
  });

  it("nunca acepta un data URL como logo ni como foto de plato", () => {
    const dataUrl = "data:image/png;base64,AAAA";
    expect(liveMutation.safeParse({ type: "saveSettings", expectedVersion: "2026-10-20T10:00:00Z", profile: { ...profile, logoUrl: dataUrl }, schedule: null }).success).toBe(false);
    expect(
      liveMutation.safeParse({
        type: "saveDish",
        categoryId: TENANT_A,
        dish: { name: "Plato", description: "", price: 1000, image: dataUrl, tags: [], active: true },
      }).success,
    ).toBe(false);
  });

  it("un plato acepta la ruta de su foto", () => {
    expect(
      liveMutation.safeParse({
        type: "saveDish",
        categoryId: TENANT_A,
        dish: { name: "Plato", description: "", price: 1000, image: `${TENANT_A}/dish/${ID}.webp`, tags: [], active: true },
      }).success,
    ).toBe(true);
  });

  it("saveCover exige versión y acepta ruta, https o null", () => {
    const base = { type: "saveCover", expectedVersion: "2026-10-20T10:00:00Z" };
    expect(liveMutation.safeParse({ ...base, coverUrl: `${TENANT_A}/cover/${ID}.webp` }).success).toBe(true);
    expect(liveMutation.safeParse({ ...base, coverUrl: null }).success).toBe(true);
    expect(liveMutation.safeParse({ type: "saveCover", coverUrl: null }).success).toBe(false);
    expect(liveMutation.safeParse({ ...base, coverUrl: "data:image/png;base64,AAAA" }).success).toBe(false);
  });
});

describe("formulario de platos acepta la ruta de una foto subida", () => {
  it("una ruta de Storage no se valida como URL", () => {
    const values = { id: undefined, name: "Milanesa", description: "", price: "12500", categoryId: "c1", image: `${TENANT_A}/dish/${ID}.webp`, tags: [], active: true };
    const result = validateDishForm(values, [{ id: "c1" }]);
    expect(result.ok).toBe(true);
  });
});

describe("resolveImageRef", () => {
  const path = `${TENANT_A}/dish/${ID}.webp`;
  const signed = new Map([[path, "https://project.supabase.co/storage/v1/object/sign/tenant-images/x?token=t"]]);

  it("una ruta firmada se reemplaza por su URL", () => {
    expect(resolveImageRef(signed, path)).toBe(signed.get(path));
  });
  it("una ruta que no se pudo firmar queda sin imagen (la carta no se rompe)", () => {
    expect(resolveImageRef(new Map(), path)).toBeNull();
  });
  it("las URLs https de las demos pasan tal cual y lo vacío sigue vacío", () => {
    expect(resolveImageRef(signed, "https://images.unsplash.com/x")).toBe("https://images.unsplash.com/x");
    expect(resolveImageRef(signed, null)).toBeNull();
    expect(resolveImageRef(signed, undefined)).toBeNull();
  });
});
