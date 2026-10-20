"use client";

import { DataError } from "@/components/ui/data-error";

export default function AuthError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <DataError {...props} />;
}
