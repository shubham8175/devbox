"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { isDesktopApp } from "@/lib/desktop";

interface DownloadFinished {
  name: string;
  path: string;
  success: boolean;
}

/**
 * Listens for events from the Tauri shell and surfaces them in the existing
 * toast UI. Renders nothing and does nothing at all on the web: the Tauri
 * event API is only imported (dynamically) when the page runs inside the
 * desktop app, so it never ends up in the web bundle's critical path.
 *
 * Currently the only event is `devbox://download-finished`, emitted by
 * src-tauri/src/lib.rs after a file chosen with an `<a download>` link or
 * `downloadBlob()` has been written to the user's Downloads folder — the
 * webview has no download UI of its own, so this is the only feedback.
 */
export function DesktopBridge() {
  const { toast } = useToast();

  useEffect(() => {
    if (!isDesktopApp()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<DownloadFinished>("devbox://download-finished", (event) => {
          const { name, success } = event.payload;
          if (success) toast(`Saved ${name} to Downloads`);
          else toast(`Could not save ${name}`, "error");
        }),
      )
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {
        // Event API unavailable (e.g. capability missing): downloads still
        // happen, the user just gets no toast.
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [toast]);

  return null;
}
