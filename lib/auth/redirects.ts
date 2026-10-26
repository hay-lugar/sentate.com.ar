/** Solo rutas internas relativas: evita open redirects (`//evil.com`, `https://…`). */
export function safeNext(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
