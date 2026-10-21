import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/format";

/**
 * Botones de Sentate. Una sola familia: `primary` (acción principal, usa --brand: tinta de Sentate o color del
 * comercio), `secondary` (borde), `quiet` (sin borde) y `danger`. `buttonClass` sirve también para <Link>.
 */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-fg hover:opacity-90",
  secondary: "border border-line-strong bg-surface text-foreground hover:bg-subtle",
  quiet: "text-foreground hover:bg-subtle",
  danger: "border border-line-strong bg-surface text-danger hover:bg-subtle",
};
const SIZE: Record<ButtonSize, string> = {
  sm: "h-10 px-3.5 text-[14px]",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-6 text-[16px]",
};

export function buttonClass({ variant = "primary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export function Button({
  variant,
  size,
  pending,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; pending?: boolean }) {
  return (
    <button type={type} disabled={disabled || pending} aria-busy={pending || undefined} className={buttonClass({ variant, size, className })} {...props}>
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
