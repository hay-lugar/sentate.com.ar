export const MIN_PASSWORD_LENGTH = 8;
/** Límite de bcrypt (72 bytes); por encima, Supabase no conserva el resto. */
const MAX_PASSWORD_BYTES = 72;

/** Problema de una contraseña nueva, o null si es aceptable. Mismas reglas en alta y recuperación. */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return "La contraseña es demasiado larga.";
  if (confirm !== undefined && password !== confirm) return "Las contraseñas no coinciden.";
  return null;
}
