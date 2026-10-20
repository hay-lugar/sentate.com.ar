"use client";

import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/format";

export const authInputClass =
  "h-13 w-full rounded-2xl bg-background px-4 text-[16px] text-foreground ring-1 ring-line outline-none transition-shadow placeholder:text-muted/80 focus:bg-surface focus:ring-2 focus:ring-brand";

export function AuthField({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block px-1 text-[13px] font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 px-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export function SubmitButton({ children, pendingLabel, disabled }: { children: ReactNode; pendingLabel: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className="pressable flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand font-display text-[16px] font-bold text-brand-fg shadow-brand disabled:opacity-70"
    >
      {pending ? (
        <>
          <LoaderCircle className="size-5 animate-spin" aria-hidden /> {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function FormMessage({ error, info }: { error?: string; info?: string }) {
  if (!error && !info) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-2xl p-3 text-[13px] leading-snug",
        error ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-900",
      )}
    >
      {error ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {error ?? info}
    </p>
  );
}
