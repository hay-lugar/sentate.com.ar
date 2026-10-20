"use client";

import { DataError } from "@/components/ui/data-error";

export default function AdminIndexError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <DataError {...props} title="No pudimos cargar tus locales" />;
}
