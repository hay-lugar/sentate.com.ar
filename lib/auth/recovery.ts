/** Mensaje neutral: no revela si el email tiene cuenta. Se muestra también cuando el envío falla por causas internas. */
export const RECOVERY_NEUTRAL_MESSAGE =
  "Si hay una cuenta con ese email, te enviamos un enlace para crear una contraseña nueva. Revisá también la carpeta de spam.";

export const RECOVERY_LINK_ERROR = "El enlace no es válido, venció o ya se usó. Pedí uno nuevo.";

export const RECOVERY_PATH = "/recuperar";
export const RECOVERY_NEW_PASSWORD_PATH = "/recuperar/nueva";

/** Adónde volver cuando el callback no puede canjear el enlace. */
export function failedAuthPath(next: string | null): string {
  return next?.startsWith(RECOVERY_PATH) ? `${RECOVERY_PATH}?error=enlace` : "/login?error=confirmacion";
}

/** Tipos de OTP que el callback acepta por `token_hash`. Cualquier otro se rechaza. */
export const CALLBACK_OTP_TYPES = ["recovery", "signup"] as const;
export type CallbackOtpType = (typeof CALLBACK_OTP_TYPES)[number];

export function isCallbackOtpType(value: string | null): value is CallbackOtpType {
  return value !== null && (CALLBACK_OTP_TYPES as readonly string[]).includes(value);
}
