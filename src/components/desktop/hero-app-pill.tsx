"use client";

import { useSyncExternalStore } from "react";
import { MonitorCheck, MonitorDown } from "lucide-react";
import { detectDesktopOs, isDesktopApp, type DesktopOs } from "@/lib/desktop";
import { DESKTOP_DOWNLOAD_URLS, DESKTOP_RELEASES_URL } from "@/lib/site";

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-card";

const noopSubscribe = () => () => {};

interface Env {
  desktopApp: boolean;
  os: DesktopOs;
}

let cachedEnv: Env | null = null;
function envSnapshot(): Env {
  if (!cachedEnv) {
    cachedEnv = { desktopApp: isDesktopApp(), os: detectDesktopOs(navigator.userAgent, navigator.maxTouchPoints) };
  }
  return cachedEnv;
}

const labels: Record<DesktopOs, string> = {
  macos: "Download for macOS",
  windows: "Download for Windows",
  other: "Download desktop app",
};

const hrefs: Record<DesktopOs, string> = {
  macos: DESKTOP_DOWNLOAD_URLS.macos,
  windows: DESKTOP_DOWNLOAD_URLS.windows,
  other: DESKTOP_RELEASES_URL,
};

/**
 * Homepage pill for the native desktop app (src-tauri). On the web it is a
 * direct download of the installer for the visitor's OS once that is known
 * after hydration (the server snapshot is the generic label and links to the
 * releases page, so the static HTML and the first client render match).
 * Inside the desktop app it turns into a quiet "Running as an app" confirmation.
 */
export function HeroAppPill() {
  const env = useSyncExternalStore(noopSubscribe, envSnapshot, () => null);

  if (env?.desktopApp) {
    return (
      <li className={`${pillClass} bg-surface text-fg-muted`}>
        <MonitorCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        Running as an app
      </li>
    );
  }

  const os = env?.os ?? "other";
  const isFile = os !== "other";

  return (
    <li>
      <a
        href={hrefs[os]}
        // A direct file download should not leave an empty tab behind; only the
        // releases page fallback opens in a new tab.
        target={isFile ? undefined : "_blank"}
        rel={isFile ? undefined : "noopener noreferrer"}
        className={`${pillClass} border-accent/40 bg-accent-soft text-accent-strong transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        <MonitorDown className="h-3.5 w-3.5" aria-hidden="true" />
        {labels[os]}
      </a>
    </li>
  );
}
