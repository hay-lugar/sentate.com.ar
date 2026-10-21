"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, type FormState } from "@/app/(auth)/actions";
import { AuthField, FormMessage, SubmitButton, authInputClass } from "./auth-form";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signInAction, { error: initialError });
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <AuthField label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} className={authInputClass} />
      </AuthField>
      <AuthField label="Contraseña" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={authInputClass} />
      </AuthField>
      <p className="-mt-2 text-right text-[13px]">
        <Link href="/recuperar" className="font-medium text-foreground underline underline-offset-4">
          Olvidé mi contraseña
        </Link>
      </p>
      <FormMessage error={state.error} info={state.info} />
      <SubmitButton pendingLabel="Ingresando…">Ingresar</SubmitButton>
      <p className="text-center text-[14px] text-muted">
        ¿Todavía no tenés cuenta?{" "}
        <Link href="/registro" className="font-medium text-foreground underline underline-offset-4">
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}
