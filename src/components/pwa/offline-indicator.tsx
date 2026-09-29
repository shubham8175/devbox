"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/pwa";
import { cn } from "@/lib/utils";

/** Small "Offline" pill. Renders nothing while connected. */
export function OfflineIndicator({ compact = false, className }: { compact?: boolean; className?: string }) {
  const online = useOnline();
  if (online) return null;

  return (
    <span
      role="status"
      title={compact ? "Offline" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border bg-warning-soft font-medium text-warning",
        compact ? "h-7 w-7 justify-center" : "px-2 py-0.5 text-[11px]",
        className,
      )}
    >
      <WifiOff className="h-3 w-3" aria-hidden="true" />
      {compact ? <span className="sr-only">Offline</span> : "Offline"}
    </span>
  );
}
