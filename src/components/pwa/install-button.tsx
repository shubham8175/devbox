"use client";

import { Download } from "lucide-react";
import { usePwaInstall } from "@/lib/pwa";
import { cn } from "@/lib/utils";

/**
 * Subtle sidebar-footer install action. Renders nothing until the browser
 * fires beforeinstallprompt, and disappears again once installed — never a
 * modal, never repeated nagging.
 */
export function InstallButton({ compact }: { compact: boolean }) {
  const { available, promptInstall } = usePwaInstall();

  if (!available) return null;

  return (
    <div className={cn("border-t pb-[env(safe-area-inset-bottom)] pt-1.5", compact ? "px-2" : "px-3")}>
      <button
        type="button"
        onClick={promptInstall}
        title="Install DevBox"
        className={cn(
          "flex h-8 w-full items-center gap-2.5 rounded-lg text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg cursor-pointer",
          compact ? "justify-center px-0" : "px-2.5",
        )}
      >
        <Download className="h-4 w-4 shrink-0 text-fg-subtle" />
        {compact ? null : <span className="truncate">Install DevBox</span>}
      </button>
    </div>
  );
}
