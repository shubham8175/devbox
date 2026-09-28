import { cloneElement, forwardRef, isValidElement, type ButtonHTMLAttributes, type ReactElement } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Render the child element (e.g. a Link) with button styles instead of a <button>. */
  asChild?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white border-transparent hover:bg-accent-strong",
  secondary:
    "bg-surface text-fg border-border hover:bg-surface-hover hover:border-border-strong",
  ghost: "bg-transparent text-fg-muted border-transparent hover:bg-surface-hover hover:text-fg",
  danger: "bg-danger-soft text-danger border-transparent hover:bg-danger hover:text-white",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
  icon: "h-8 w-8 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", asChild, children, ...props },
  ref,
) {
  const classes = cn(base, variants[variant], sizes[size], className);
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, { className: cn(classes, child.props.className) });
  }
  return (
    <button ref={ref} className={classes} type="button" {...props}>
      {children}
    </button>
  );
});
