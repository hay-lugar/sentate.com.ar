"use client";

import { DataError } from "@/components/ui/data-error";

export default function TenantError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <DataError {...props} title="No pudimos cargar la carta" />;
}
