/**
 * Compara marcas de versión (timestamps ISO de la base) por INSTANTE, no por texto: la precisión fraccionaria
 * (`…15.1Z`, `…15.123456+00:00`) y el formato de la zona cambian según de dónde venga el valor, y comparados como
 * texto una versión más nueva puede resultar «menor» dentro del mismo segundo.
 */
export function isNewer(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a > b;
  return ta > tb;
}
