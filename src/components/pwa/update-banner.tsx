"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { applyUpdate, useUpdateAvailable } from "@/lib/pwa";
import { Button } from "@/components/ui/button";

/**
 * Persistent (non-auto-dismissing) bottom banner shown once a new service
 * worker is installed and waiting. "Later" only hides it for this update; the
 * new version takes over on the next full page load anyway.
 */
export function UpdateBanner() {
  const updateAvailable = useUpdateAvailable();
  const [dismissed, setDismissed] = useState(false);

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-[max(1rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] sm:justify-start"
    >
      <div className="pointer-events-auto flex w-full max-w-sm flex-wrap items-center gap-3 rounded-lg border border-border-strong bg-surface/95 px-3.5 py-3 text-sm shadow-lg backdrop-blur animate-toast-in">
        <RefreshCw className="h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
        <p className="min-w-0 flex-1 basis-40 text-fg">A new version of DevBox is available.</p>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Later
          </Button>
          <Button size="sm" variant="primary" onClick={applyUpdate}>
            Update
          </Button>
        </div>
      </div>
    </div>
  );
}
