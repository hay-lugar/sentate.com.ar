"use client";

import { useRouter } from "next/navigation";
import { mutateTenantAction } from "@/app/admin/[slug]/actions";
import { ImageUploader, type ImageChangeResult } from "./image-uploader";
import { useDemo, type LiveInfo } from "./demo-provider";

/**
 * Portada del comercio. A diferencia del logo (que viaja con "Guardar cambios" de Ajustes), la portada se guarda
 * apenas termina la subida: tiene su propia mutación con control de versión. La imagen anterior sigue
 * referenciada hasta que ese guardado se confirma.
 */
export function CoverField({ live }: { live: LiveInfo }) {
  const router = useRouter();
  const { notify } = useDemo();

  const onChange = async (path: string | null): Promise<ImageChangeResult> => {
    const res = await mutateTenantAction(live.tenantId, { type: "saveCover", expectedVersion: live.settingsVersion, coverUrl: path }).catch(() => null);
    if (!res) return { ok: false, message: "Sin conexión. Revisá tu internet y reintentá." };
    if (!res.ok) {
      if (res.code === "stale") router.refresh();
      return { ok: false, message: res.message };
    }
    notify(path ? "Portada guardada." : "Portada quitada.");
    router.refresh();
    return { ok: true };
  };

  return <ImageUploader tenantId={live.tenantId} kind="cover" shape="wide" value={live.coverUrl} onChange={onChange} />;
}
