"use client";

import { useState } from "react";
import { deleteAccountAction } from "@/app/cuenta/actions";
import { authInputClass } from "@/components/auth/auth-form";
import { Button } from "@/components/ui/button";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        Eliminar mi cuenta
      </Button>
    );
  }
  return (
    <div role="group" aria-label="Eliminar cuenta" className="space-y-3 rounded-xl border border-danger/40 p-4">
      <p className="text-[15px]">
        Se borran tu acceso, tu perfil y tus favoritos. Las reservas que hiciste quedan en cada local (con el nombre y teléfono que les diste) pero ya no
        se asocian a vos. No se puede deshacer.
      </p>
      <div>
        <label htmlFor="del-confirm" className="mb-1.5 block type-label">
          Escribí ELIMINAR para confirmar
        </label>
        <input id="del-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" className={authInputClass} />
      </div>
      {error && (
        <p role="alert" className="text-[14px] text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="danger"
          disabled={text !== "ELIMINAR"}
          pending={busy}
          onClick={async () => {
            setBusy(true);
            const res = await deleteAccountAction(text);
            // En éxito la acción redirige; si vuelve, hubo un error.
            setBusy(false);
            if (res && !res.ok) setError(res.message);
          }}
        >
          Eliminar definitivamente
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)} disabled={busy}>
          Volver
        </Button>
      </div>
    </div>
  );
}
