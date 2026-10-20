import jsQR from "jsqr";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { QR_OPTIONS } from "@/lib/qr/config";
import { qrPngBuffer, qrSvg } from "@/lib/qr/generate";
import { displayUrl, isPilotOrigin, publicMenuUrl, qrFileName } from "@/lib/qr/url";

const URL_A = "https://sentate.com.ar/el-bodegon";

/** Decodifica un PNG real con jsQR. Devuelve el texto del QR o null si no se pudo leer. */
function decodePng(buffer: Buffer): string | null {
  const png = PNG.sync.read(buffer);
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
}

/**
 * Rasteriza el SVG que genera la librería (un fondo y un <path> con segmentos `M x y` / `m dx 0` / `h len`) a píxeles
 * y lo decodifica. Prueba el archivo SVG real que se descarga, no solo la matriz interna.
 */
function decodeSvg(svg: string, pxPerUnit = 8): string | null {
  const side = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  const d = /<path[^>]*stroke="#000000"[^>]*d="([^"]+)"/.exec(svg)?.[1] ?? "";
  const size = side * pxPerUnit;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255); // fondo blanco opaco
  let x = 0;
  let y = 0;
  for (const m of d.matchAll(/([Mmh])\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+))?/g)) {
    const [, cmd, a, b] = m;
    if (cmd === "M") {
      x = Number(a);
      y = Number(b);
    } else if (cmd === "m") {
      x += Number(a);
      y += Number(b ?? 0);
    } else {
      const length = Number(a);
      const row = Math.floor(y); // la línea se dibuja a y + 0.5: pertenece a la fila floor(y)
      for (let px = Math.round(x * pxPerUnit); px < Math.round((x + length) * pxPerUnit); px++) {
        for (let py = row * pxPerUnit; py < (row + 1) * pxPerUnit; py++) {
          const i = (py * size + px) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
      }
      x += length;
    }
  }
  return jsQR(rgba, size, size)?.data ?? null;
}

describe("QR del comercio: el contenido decodifica a la URL canónica", () => {
  it("PNG de descarga (1200 px)", async () => {
    expect(decodePng(await qrPngBuffer(URL_A))).toBe(URL_A);
  });

  it("PNG a tamaños de pantalla chicos (preview en el celular)", async () => {
    expect(decodePng(await qrPngBuffer(URL_A, 240))).toBe(URL_A);
  });

  it("SVG de descarga", async () => {
    expect(decodeSvg(await qrSvg(URL_A))).toBe(URL_A);
  });

  it("slugs largos y con guiones", async () => {
    const url = publicMenuUrl("https://sentate.com.ar", "la-esquina-de-palermo-hollywood-2026");
    expect(decodePng(await qrPngBuffer(url))).toBe(url);
    expect(decodeSvg(await qrSvg(url))).toBe(url);
  });

  it("un QR distinto no se confunde: cada comercio decodifica a su propia URL", async () => {
    const a = publicMenuUrl("https://sentate.com.ar", "uno");
    const b = publicMenuUrl("https://sentate.com.ar", "dos");
    expect(decodePng(await qrPngBuffer(a))).toBe(a);
    expect(decodePng(await qrPngBuffer(b))).toBe(b);
  });
});

describe("QR del comercio: lectura confiable", () => {
  it("el SVG es negro sobre blanco y trae zona de silencio de 4 módulos", async () => {
    const svg = await qrSvg(URL_A);
    expect(svg).toContain('stroke="#000000"');
    expect(svg).toContain("#ffffff");
    // Primer módulo oscuro a 4 unidades del borde: el margen del estándar.
    expect(/d="M4 4\.5h/.test(svg)).toBe(true);
    expect(QR_OPTIONS.margin).toBe(4);
  });

  it("el SVG no lleva logo ni imágenes embebidas encima", async () => {
    const svg = await qrSvg(URL_A);
    expect(svg).not.toMatch(/<image|<text|<use|data:image/);
  });

  it("el PNG tiene fondo blanco opaco en la zona de silencio (esquinas)", async () => {
    const png = PNG.sync.read(await qrPngBuffer(URL_A, 600));
    for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]]) {
      const i = (y * png.width + x) * 4;
      expect([png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]]).toEqual([255, 255, 255, 255]);
    }
  });

  it("la zona de silencio mide 4 módulos en el PNG (no se recorta ni se pisa)", async () => {
    const png = PNG.sync.read(await qrPngBuffer(URL_A, 600));
    const modules = QRCode.create(URL_A, { errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel }).modules.size;
    const pxPerModule = png.width / (modules + 2 * QR_OPTIONS.margin);
    // Primer píxel oscuro de la fila central: debe quedar a ~4 módulos del borde izquierdo.
    const row = Math.floor(png.height / 2);
    let firstDark = -1;
    for (let x = 0; x < png.width; x++) {
      if (png.data[(row * png.width + x) * 4] < 128) {
        firstDark = x;
        break;
      }
    }
    expect(firstDark / pxPerModule).toBeGreaterThanOrEqual(QR_OPTIONS.margin - 0.5);
    expect(firstDark / pxPerModule).toBeLessThanOrEqual(QR_OPTIONS.margin + 0.5);
  });
});

describe("URL canónica y origen del piloto", () => {
  it("publicMenuUrl arma <origen>/<slug> en minúsculas y sin barra doble", () => {
    expect(publicMenuUrl("https://sentate.com.ar", "El-Bodegon")).toBe("https://sentate.com.ar/el-bodegon");
    expect(publicMenuUrl("https://sentate.com.ar/", "mi-local")).toBe("https://sentate.com.ar/mi-local");
  });

  it("isPilotOrigin: solo https con un dominio real", () => {
    expect(isPilotOrigin("https://sentate.com.ar")).toBe(true);
    expect(isPilotOrigin("https://preview-abc.vercel.app")).toBe(true);
    expect(isPilotOrigin("http://sentate.com.ar")).toBe(false);
    for (const origin of ["http://localhost:3000", "https://localhost:3000", "http://127.0.0.1:3300", "https://app.localhost", "no-es-url", ""]) {
      expect(isPilotOrigin(origin)).toBe(false);
    }
  });

  it("qrFileName marca como prueba lo que no es del piloto", () => {
    expect(qrFileName("El-Bodegon", "svg", true)).toBe("qr-el-bodegon.svg");
    expect(qrFileName("el-bodegon", "png", false)).toBe("qr-el-bodegon-prueba.png");
  });

  it("displayUrl quita el protocolo para mostrarlo impreso", () => {
    expect(displayUrl("https://sentate.com.ar/el-bodegon")).toBe("sentate.com.ar/el-bodegon");
  });
});
