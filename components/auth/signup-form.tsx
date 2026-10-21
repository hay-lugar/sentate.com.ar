"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type FormState } from "@/app/(auth)/actions";
import { AuthField, FormMessage, SubmitButton, authInputClass } from "./auth-form";

export function SignupForm() {
  const [state, action] = useActionState<FormState, FormData>(signUpAction, {});
  if (state.info) return <FormMessage info={state.info} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <AuthField label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} className={authInputClass} />
      </AuthField>
      <AuthField label="Contraseña" htmlFor="password" hint="Mínimo 8 caracteres.">
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className={authInputClass} />
      </AuthField>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Creando cuenta…">Crear cuenta</SubmitButton>
      <p className="text-center type-help">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Ingresá
        </Link>
      </p>
    </form>
  );
}
