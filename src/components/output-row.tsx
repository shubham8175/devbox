"use client";

import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

interface OutputRowProps {
  label: ReactNode;
  value: string;
  /** Optional hint rendered under the label */
  hint?: ReactNode;
  mono?: boolean;
  copyable?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * A labelled, copyable value row. Used by nearly every tool for its results.
 */
export function OutputRow({ label, value, hint, mono = true, copyable = true, className, placeholder = "—" }: OutputRowProps) {
  const empty = value === "";
  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-3 rounded-lg border bg-bg-elevated px-3 py-2 transition-colors hover:border-border-strong",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{label}</div>
        <div
          className={cn(
            "mt-0.5 break-all text-sm",
            mono && "font-mono",
            empty ? "text-fg-subtle" : "text-fg",
          )}
        >
          {empty ? placeholder : value}
        </div>
        {hint ? <div className="mt-0.5 text-[11px] text-fg-subtle">{hint}</div> : null}
      </div>
      {copyable ? <CopyButton value={value} iconOnly className="shrink-0" /> : null}
    </div>
  );
}

export function OutputGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-2 sm:grid-cols-2", className)}>{children}</div>;
}
