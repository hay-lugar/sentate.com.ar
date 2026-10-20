"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { requestPasswordResetAction, type FormState } from "@/app/(auth)/actions";
import { AuthField, FormMessage, SubmitButton, authInputClass } from "./auth-form";

/** Segundos antes de poder pedir otro enlace: evita envíos repetidos desde el mismo formulario. */
const RESEND_COOLDOWN_S = 60;

export function RecoverForm({ initialError }: { initialError?: string }) {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordResetAction, { error: initialError });
  const [cooldown, setCooldown] = useState(0);

  // Cada respuesta neutral reinicia el enfriamiento. El temporizador vive en el efecto para limpiarse al desmontar.
  useEffect(() => {
    if (!state.info) return;
    const start = setTimeout(() => setCooldown(RESEND_COOLDOWN_S), 0);
    return () => clearTimeout(start);
  }, [state]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const tick = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(tick);
  }, [cooldown]);

  return (
    <form action={action} className="space-y-4" noValidate>
      <AuthField label="Email" htmlFor="recover-email" hint="Te enviamos un enlace para crear una contraseña nueva.">
        <input
          id="recover-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.fields?.email}
          aria-invalid={!!state.error && !state.info}
          className={authInputClass}
        />
      </AuthField>
      <FormMessage error={state.error} info={state.info} />
      <SubmitButton pendingLabel="Enviando…" disabled={cooldown > 0}>
        {cooldown > 0 ? `Podés pedir otro enlace en ${cooldown} s` : state.info ? "Enviar otro enlace" : "Enviarme el enlace"}
      </SubmitButton>
      <p className="text-center text-[14px] text-muted">
        <Link href="/login" className="font-semibold text-brand underline-offset-4 hover:underline">
          Volver a ingresar
        </Link>
      </p>
    </form>
  );
}
