"use client";

import { useSyncExternalStore } from "react";
import { MonitorCheck, MonitorDown, Smartphone } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { detectDesktopOs, detectMobileOs, isDesktopApp, type DesktopOs, type MobileOs } from "@/lib/desktop";
import { isStandaloneDisplay, manualInstallHint, usePwaInstall } from "@/lib/pwa";
import { DESKTOP_DOWNLOAD_URLS, DESKTOP_RELEASES_URL, INSTALL_GUIDE_URL } from "@/lib/site";

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-card";
const actionPillClass = `${pillClass} border-accent/40 bg-accent-soft text-accent-strong transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer`;

const noopSubscribe = () => () => {};

interface Env {
  /** Inside the Tauri desktop app. */
  desktopApp: boolean;
  /** Installed web app (home screen / dock) rather than a browser tab. */
  standalone: boolean;
  os: DesktopOs;
  mobile: MobileOs;
}

let cachedEnv: Env | null = null;
function envSnapshot(): Env {
  if (!cachedEnv) {
    const ua = navigator.userAgent;
    cachedEnv = {
      desktopApp: isDesktopApp(),
      standalone: isStandaloneDisplay(),
      os: detectDesktopOs(ua, navigator.maxTouchPoints),
      mobile: detectMobileOs(ua, navigator.maxTouchPoints),
    };
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
 * Homepage pill for getting DevBox as an app. On a desktop browser it is a
 * direct download of the native installer (src-tauri) for the visitor's OS
 * once that is known after hydration; the server snapshot is the generic label
 * and links to the releases page, so the static HTML and the first client
 * render match. On a phone or tablet it becomes "Add to Home Screen" for the
 * web app: the native install prompt where the browser has one, otherwise a
 * toast with the manual steps and a link to the README's install guide.
 * Inside either kind of installed app it turns into a quiet "Running as an
 * app" confirmation.
 */
export function HeroAppPill() {
  const env = useSyncExternalStore(noopSubscribe, envSnapshot, () => null);
  const { state, promptInstall } = usePwaInstall();
  const { toast } = useToast();

  if (env?.desktopApp || env?.standalone || state === "installed") {
    return (
      <li className={`${pillClass} bg-surface text-fg-muted`}>
        <MonitorCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        Running as an app
      </li>
    );
  }

  if (env?.mobile) {
    const onClick = () => {
      if (state === "prompt") void promptInstall();
      else toast(manualInstallHint(navigator.userAgent), "info", { label: "Install guide", href: INSTALL_GUIDE_URL });
    };
    return (
      <li>
        <button type="button" onClick={onClick} className={actionPillClass}>
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          Add to Home Screen
        </button>
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
        className={actionPillClass}
      >
        <MonitorDown className="h-3.5 w-3.5" aria-hidden="true" />
        {labels[os]}
      </a>
    </li>
  );
}
