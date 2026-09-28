"use client";

import { forwardRef } from "react";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { formatChars, MAX_TEXT_INPUT } from "@/lib/limits";
import { cn } from "@/lib/utils";

interface CodeTextareaProps extends TextareaProps {
  /** Show a character / line counter under the textarea */
  counter?: boolean;
}

function countLines(s: string): number {
  let n = 1;
  for (let i = s.indexOf("\n"); i !== -1; i = s.indexOf("\n", i + 1)) n++;
  return n;
}

/** Monospace textarea with an optional character/line counter. */
export const CodeTextarea = forwardRef<HTMLTextAreaElement, CodeTextareaProps>(function CodeTextarea(
  { counter = true, className, value, maxLength = MAX_TEXT_INPUT, ...props },
  ref,
) {
  const text = typeof value === "string" ? value : "";
  const atLimit = text.length >= maxLength;
  return (
    <div>
      <Textarea ref={ref} value={value} maxLength={maxLength} className={cn("min-h-[200px]", className)} {...props} />
      {counter ? (
        <div className={cn("mt-1.5 text-right font-mono text-[11px]", atLimit ? "text-warning" : "text-fg-subtle")}>
          {atLimit ? `Input limited to ${formatChars(maxLength)} chars · ` : ""}
          {text.length.toLocaleString()} chars · {text ? countLines(text).toLocaleString() : 0} lines
        </div>
      ) : null}
    </div>
  );
});
