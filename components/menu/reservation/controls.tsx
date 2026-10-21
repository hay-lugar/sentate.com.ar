import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/format";

export function Chip({ selected, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "pressable rounded-xl font-medium ring-1 disabled:opacity-40",
        selected ? "bg-brand text-brand-fg ring-brand" : "bg-surface text-foreground ring-line-strong hover:bg-subtle",
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
      <Icon className="size-4 text-muted" />
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-2 flex items-start gap-1.5 px-1 text-[13px] font-medium text-danger">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

export const inputClass =
  "h-12 w-full rounded-xl bg-surface px-4 text-[16px] text-foreground ring-1 ring-field outline-none transition-shadow placeholder:text-muted focus:ring-2 focus:ring-foreground aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger disabled:bg-subtle disabled:text-muted";
