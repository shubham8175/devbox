import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, mono, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      spellCheck={false}
      autoComplete="off"
      className={cn(
        "h-9 w-full rounded-lg border bg-bg-elevated px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors",
        "hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40",
        mono && "font-mono",
        invalid && "border-danger focus:border-danger focus:ring-danger/30",
        className,
      )}
      {...props}
    />
  );
});
