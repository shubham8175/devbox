"use client";

import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { isDesktopApp } from "@/lib/desktop";
import { manualInstallHint, usePwaInstall } from "@/lib/pwa";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/**
 * Sidebar footer action for installing DevBox to the home screen or dock.
 * Uses the native prompt where the browser offers one, and otherwise explains
 * the manual steps in a toast. Hidden once installed and inside the desktop app.
 */
export function InstallButton({ compact }: { compact: boolean }) {
  const { state, promptInstall } = usePwaInstall();
  const desktopApp = useSyncExternalStore(noopSubscribe, isDesktopApp, () => false);
  const { toast } = useToast();

  if (state === "installed" || desktopApp) return null;

  const onClick = () => {
    if (state === "prompt") void promptInstall();
    else toast(manualInstallHint(navigator.userAgent));
  };

  return (
    <div className={cn("shrink-0 border-t pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5", compact ? "px-2" : "px-3")}>
      <button
        type="button"
        onClick={onClick}
        title="Install DevBox as an app"
        className={cn(
          "flex h-8 w-full items-center gap-2.5 rounded-lg text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg cursor-pointer",
          compact ? "justify-center px-0" : "px-2.5",
        )}
      >
        <Download className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        {compact ? <span className="sr-only">Install DevBox</span> : <span className="truncate">Install as app</span>}
      </button>
    </div>
  );
}
