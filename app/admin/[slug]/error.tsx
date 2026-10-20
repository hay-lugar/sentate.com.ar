"use client";

import { DataError } from "@/components/ui/data-error";

export default function AdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <DataError {...props} title="No pudimos cargar el panel" />;
}
