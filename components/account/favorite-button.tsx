"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { setFavoriteAction } from "@/app/cuenta/actions";
import { cn } from "@/lib/format";

type Props = {
  tenantId: string;
  name: string;
  initial: boolean;
  /** Null = visitante sin sesión: el corazón lleva al ingreso y vuelve acá. */
  loginHref: string | null;
  onChange?: (on: boolean) => void;
};

const base = "pressable grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-subtle hover:text-foreground";

export function FavoriteButton({ tenantId, name, initial, loginHref, onChange }: Props) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  if (loginHref) {
    return (
      <Link href={loginHref} className={base} aria-label={`Ingresar para guardar ${name} en favoritos`}>
        <Heart className="size-5" aria-hidden />
      </Link>
    );
  }
  const toggle = async () => {
    const next = !on;
    setOn(next);
    setError(null);
    const res = await setFavoriteAction(tenantId, next);
    if (!res.ok) {
      setOn(!next);
      setError(res.message);
    } else onChange?.(next);
  };
  return (
    <span className="relative">
      <button type="button" onClick={toggle} aria-pressed={on} aria-label={on ? `Quitar ${name} de favoritos` : `Guardar ${name} en favoritos`} className={cn(base, on && "text-foreground")}>
        <Heart className={cn("size-5", on && "fill-current")} aria-hidden />
      </button>
      {error && (
        <span role="alert" className="absolute top-full right-0 z-10 w-52 rounded-lg border border-line bg-background p-2 text-[0.8125rem] text-danger shadow-sm">
          {error}
        </span>
      )}
    </span>
  );
}
