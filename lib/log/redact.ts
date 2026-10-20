/**
 * Quita de un texto de log lo que no debe quedar escrito: emails, teléfonos y números largos, tokens JWT, claves de
 * Supabase y cadenas hexadecimales largas (hashes, secretos). Los mensajes de error de la base o de terceros pueden
 * citar valores de la fila que falló; los logs de la app pasan por acá antes de escribirse.
 */
export function redact(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/g, "[token]")
    .replace(/\bsb_(?:publishable|secret)_[\w-]+/g, "[clave]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[hex]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[número]")
    .slice(0, 300);
}
