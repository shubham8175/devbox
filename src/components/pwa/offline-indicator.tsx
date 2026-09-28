"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/pwa";

/** Subtle "Offline" pill. Renders nothing while connected. */
export function OfflineIndicator() {
  const online = useOnline();
  if (online) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
      <WifiOff className="h-3 w-3" />
      Offline
    </span>
  );
}
