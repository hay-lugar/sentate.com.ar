"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type FormState } from "@/app/(auth)/actions";
import type { SignupIntent } from "@/lib/auth/destinations";
import { AuthField, FormMessage, SubmitButton, authInputClass } from "./auth-form";

export function SignupForm({ intent = "comensal" }: { intent?: SignupIntent }) {
  const [state, action] = useActionState<FormState, FormData>(signUpAction, {});
  if (state.info) return <FormMessage info={state.info} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <fieldset>
        <legend className="mb-1.5 type-label">¿Para qué querés tu cuenta?</legend>
        <div className="grid gap-2">
          {(
            [
              ["comensal", "Quiero descubrir locales", "Buscar, guardar favoritos y pedir mesa."],
              ["local", "Quiero publicar mi local", "Carta con QR, reservas y panel para tu negocio."],
            ] as const
          ).map(([value, title, help]) => (
            <label key={value} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-line-strong p-3 has-[:checked]:border-foreground has-[:checked]:bg-subtle">
              <input type="radio" name="intencion" value={value} defaultChecked={intent === value} className="mt-1 size-4 shrink-0 accent-foreground" />
              <span>
                <span className="block text-[0.9375rem] font-medium">{title}</span>
                <span className="block type-help">{help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
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
