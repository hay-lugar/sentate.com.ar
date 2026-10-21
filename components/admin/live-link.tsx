"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { useDemo } from "./demo-provider";

/** Enlace del panel que solo existe con datos reales (en la demo no se muestra). */
export function LiveLink({ to, children }: { to: string; children: ReactNode }) {
  const { mode, state } = useDemo();
  if (mode !== "live") return null;
  return (
    <Link href={`/admin/${state.slug}/${to}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
      {children}
    </Link>
  );
}
