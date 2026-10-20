"use client";

import { useEffect, useState } from "react";
import type { PublicTenant } from "@/lib/domain/types";
import { toPublicTenant } from "@/lib/domain/public";
import { loadDemo } from "@/lib/demo/storage";
import type { ZonedNow } from "@/lib/time/zoned";
import { ThemeScope } from "@/components/ui/theme-scope";
import type { TenantSource } from "@/lib/data/resolve";
import { MenuView } from "./menu-view";

/**
 * Raíz cliente del menú público. Comercio real: datos de Supabase tal cual.
 * Demo: si en ESTE navegador se editó el local desde el panel de demo, aplica esos
 * cambios (leídos una vez al cargar; sin sincronizar pestañas).
 */
export function PublicMenu({
  tenant: serverTenant,
  source,
  initialNow,
}: {
  tenant: PublicTenant;
  source: TenantSource;
  initialNow: ZonedNow;
}) {
  const [tenant, setTenant] = useState(serverTenant);
  const [localEdits, setLocalEdits] = useState(false);

  useEffect(() => {
    if (source !== "demo") return;
    const stored = loadDemo(serverTenant.slug);
    if (!stored) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única de localStorage tras hidratar
    setTenant(toPublicTenant(serverTenant.slug, stored.profile, stored.categories));
    setLocalEdits(true);
  }, [serverTenant.slug, source]);

  return (
    <ThemeScope theme={tenant.theme} className="min-h-dvh bg-[color-mix(in_oklch,var(--brand)_7%,var(--background))]">
      <MenuView tenant={tenant} source={source} initialNow={initialNow} localEdits={localEdits} />
    </ThemeScope>
  );
}
