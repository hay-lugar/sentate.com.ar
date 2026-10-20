import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/format";

export function Chip({ selected, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "pressable rounded-2xl font-semibold ring-1 disabled:opacity-40 disabled:active:scale-100",
        selected ? "bg-brand text-brand-fg shadow-brand ring-brand" : "bg-surface text-foreground ring-line hover:ring-foreground/25",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SectionLabel({
  icon: Icon,
  children,
  className,
  id,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <p id={id} className={cn("mb-3 flex items-center gap-2 text-[14px] font-semibold", className)}>
      <Icon className="size-4 text-brand" />
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-2 flex items-start gap-1.5 px-1 text-[13px] font-medium text-rose-700">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

export const inputClass =
  "h-14 w-full rounded-2xl bg-background px-4 text-[16px] text-foreground ring-1 ring-line outline-none transition-shadow placeholder:text-muted/80 focus:bg-surface focus:ring-2 focus:ring-brand aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-rose-500";
