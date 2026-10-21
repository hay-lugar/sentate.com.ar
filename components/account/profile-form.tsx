"use client";

import { useActionState } from "react";
import { saveProfileAction, type AccountResult } from "@/app/cuenta/actions";
import { AuthField, FormMessage, SubmitButton, authInputClass } from "@/components/auth/auth-form";

export function ProfileForm({ displayName, phone }: { displayName: string; phone: string }) {
  const [state, action] = useActionState<AccountResult | null, FormData>(saveProfileAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <AuthField label="Nombre" htmlFor="displayName" hint="Se usa para completar tus pedidos de mesa.">
        <input id="displayName" name="displayName" defaultValue={displayName} maxLength={80} autoComplete="name" className={authInputClass} />
      </AuthField>
      <AuthField label="Teléfono" htmlFor="phone" hint="Opcional. Solo lo ve el local al que le pedís una mesa.">
        <input id="phone" name="phone" type="tel" defaultValue={phone} autoComplete="tel" className={authInputClass} />
      </AuthField>
      <FormMessage error={state && !state.ok ? state.message : undefined} info={state?.ok ? state.message : undefined} />
      <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
    </form>
  );
}
