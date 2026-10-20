"use client";

import { useActionState, useState } from "react";
import { createLocalAction, type FormState } from "@/app/(auth)/actions";
import { slugify } from "@/lib/format";
import { AuthField, FormMessage, SubmitButton, authInputClass } from "./auth-form";

export function CreateLocalForm() {
  const [state, action] = useActionState<FormState, FormData>(createLocalAction, {});
  const [name, setName] = useState(state.fields?.name ?? "");
  const [slug, setSlug] = useState(state.fields?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form action={action} className="space-y-4" noValidate>
      <AuthField label="Nombre del local" htmlFor="name">
        <input
          id="name"
          name="name"
          required
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="Ej: Café Malva"
          className={authInputClass}
        />
      </AuthField>
      <AuthField label="Dirección de tu menú" htmlFor="slug" hint={`sentate.com.ar/${slug || "tu-local"}`}>
        <input
          id="slug"
          name="slug"
          required
          maxLength={48}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
          }}
          className={authInputClass}
        />
      </AuthField>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Creando local…">Crear mi local</SubmitButton>
    </form>
  );
}
