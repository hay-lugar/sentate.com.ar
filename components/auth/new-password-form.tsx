"use client";

import { useActionState } from "react";
import { setNewPasswordAction, type FormState } from "@/app/(auth)/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { AuthField, FormMessage, SubmitButton, authInputClass } from "./auth-form";

export function NewPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(setNewPasswordAction, {});
  const hintId = "new-password-hint";

  return (
    <form action={action} className="space-y-4" noValidate>
      <AuthField label="Contraseña nueva" htmlFor="password" hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          aria-invalid={!!state.error}
          aria-describedby={hintId}
          className={authInputClass}
        />
      </AuthField>
      <AuthField label="Repetí la contraseña" htmlFor="confirm">
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={!!state.error}
          className={authInputClass}
        />
      </AuthField>
      <FormMessage error={state.error} info={state.info} />
      <SubmitButton pendingLabel="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}
