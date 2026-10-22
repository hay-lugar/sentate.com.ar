/**
 * A dónde lleva cada recorrido de autenticación. Una persona NUNCA queda obligada a crear un local: el alta de un local es
 * una elección explícita («Quiero publicar mi local») y el resto de las personas van a su cuenta.
 */
export type SignupIntent = "comensal" | "local";

/** Solo «local» (la elección explícita) activa el alta de un local; cualquier otro valor es comensal. */
export function parseIntent(value: unknown): SignupIntent {
  return value === "local" ? "local" : "comensal";
}

/** Destino tras registrarse (o tras confirmar el email). */
export function postSignupPath(intent: SignupIntent): string {
  return intent === "local" ? "/registro/local" : "/cuenta";
}

/** Destino tras ingresar o guardar una clave nueva: lo pedido, o el panel si administra locales, o su cuenta. */
export function postLoginPath(opts: { next?: string | null; hasTenants: boolean }): string {
  return opts.next ?? (opts.hasTenants ? "/admin" : "/cuenta");
}

/** Dónde vuelve alguien que no quiere (o ya no necesita) crear un local. */
export function leaveCreateLocalPath(firstSlug: string | null): string {
  return firstSlug ? `/admin/${firstSlug}` : "/cuenta";
}
