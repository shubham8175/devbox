import { forwardRef, type TextareaHTMLAttributes } from "react";
import { MAX_TEXT_INPUT } from "@/lib/limits";
import { cn } from "@/lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, maxLength = MAX_TEXT_INPUT, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      maxLength={maxLength}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      className={cn(
        "w-full resize-y rounded-lg border bg-bg-elevated p-3 font-mono text-[13px] leading-relaxed text-fg placeholder:text-fg-subtle transition-colors",
        "hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40",
        invalid && "border-danger focus:border-danger focus:ring-danger/30",
        className,
      )}
      {...props}
    />
  );
});
