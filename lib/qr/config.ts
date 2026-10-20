/**
 * Opciones del QR del comercio. Una sola fuente para el SVG, el PNG y las pruebas.
 *
 * - Negro sobre blanco, SIEMPRE: el color del comercio puede bajar el contraste y el lector no escanea.
 * - Margen (zona de silencio) de 4 módulos, el mínimo del estándar. Sin él, muchos lectores fallan sobre
 *   fondos no blancos o junto a otro texto.
 * - Corrección de errores M (15 %): suficiente sin logo encima. No se superpone ningún logo: tapar módulos
 *   obliga a subir el nivel de corrección y baja la tolerancia a impresiones sucias o gastadas.
 */
export const QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 4,
  color: { dark: "#000000", light: "#ffffff" },
} as const;

/** Lado del PNG descargable: 1200 px son 10 cm a 300 dpi. */
export const QR_PNG_SIZE = 1200;

/** Lado mínimo recomendado del QR impreso, en centímetros. La calcomanía lo imprime a 11 cm. */
export const QR_PRINT_MIN_CM = 8;
