"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";

export { inputClass as authInputClass } from "@/components/menu/reservation/controls";

export function AuthField({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block type-label">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 type-help">{hint}</p>}
    </div>
  );
}

export function SubmitButton({ children, pendingLabel, disabled }: { children: ReactNode; pendingLabel: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" pending={pending} disabled={disabled} className="w-full">
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function FormMessage({ error, info }: { error?: string; info?: string }) {
  if (!error && !info) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-xl border p-3 text-[14px] leading-snug",
        error ? "border-danger/40 bg-danger/5 text-danger" : "border-success/40 bg-success/5 text-success",
      )}
    >
      {error ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {error ?? info}
    </p>
  );
}
