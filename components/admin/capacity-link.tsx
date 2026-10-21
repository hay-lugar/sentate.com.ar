"use client";

import Link from "next/link";
import { Settings2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { useDemo } from "./demo-provider";

/** Acceso a la configuración de capacidad (solo comercios reales). */
export function CapacityLink() {
  const { mode, state } = useDemo();
  if (mode !== "live") return null;
  return (
    <Link href={`/admin/${state.slug}/reservas/capacidad`} className={buttonClass({ variant: "secondary", size: "sm" })}>
      <Settings2 className="size-4" aria-hidden /> Capacidad
    </Link>
  );
}
