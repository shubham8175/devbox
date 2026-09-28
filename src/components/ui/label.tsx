import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  hint?: ReactNode;
}

export function Label({ className, children, hint, ...props }: LabelProps) {
  return (
    <label
      className={cn("mb-1.5 flex items-center justify-between text-xs font-medium text-fg-muted", className)}
      {...props}
    >
      <span>{children}</span>
      {hint ? <span className="font-normal text-fg-subtle">{hint}</span> : null}
    </label>
  );
}
