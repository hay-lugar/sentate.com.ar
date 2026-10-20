const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** URL canónica de la carta pública: `<origen>/<slug>`. Sin parámetros ni barra final. */
export function publicMenuUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/${slug.toLowerCase()}`;
}

/**
 * ¿El origen sirve para material impreso del piloto? Solo https y un dominio real: un QR que apunta a localhost o a
 * http no abre en el teléfono de nadie más, o abre una página insegura.
 */
export function isPilotOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && !LOOPBACK.has(url.hostname) && !url.hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

/** Texto corto para mostrar bajo el QR impreso: la URL sin protocolo. */
export const displayUrl = (url: string) => url.replace(/^https?:\/\//, "");

/** Nombre de archivo de la descarga. Fuera del piloto lleva `-prueba` para que nadie lo imprima por error. */
export function qrFileName(slug: string, ext: "svg" | "png", pilot: boolean): string {
  return `qr-${slug.toLowerCase()}${pilot ? "" : "-prueba"}.${ext}`;
}
