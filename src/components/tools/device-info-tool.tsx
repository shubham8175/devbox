"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { useHydrated } from "@/hooks/use-hydrated";

interface Info {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
}

function subscribeViewport(cb: () => void) {
  window.addEventListener("resize", cb);
  window.addEventListener("orientationchange", cb);
  return () => {
    window.removeEventListener("resize", cb);
    window.removeEventListener("orientationchange", cb);
  };
}
function viewportSnapshot() {
  return `${window.innerWidth}×${window.innerHeight}`;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

interface UAHighEntropy {
  architecture?: string;
  bitness?: string;
  platformVersion?: string;
}

interface UAData {
  platform?: string;
  mobile?: boolean;
  brands?: Array<{ brand: string; version: string }>;
  getHighEntropyValues?: (hints: string[]) => Promise<UAHighEntropy>;
}

export function DeviceInfoTool() {
  const hydrated = useHydrated();
  const viewport = useSyncExternalStore(subscribeViewport, viewportSnapshot, () => "");
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [nonce, setNonce] = useState(0);
  const [highEntropy, setHighEntropy] = useState<UAHighEntropy | null>(null);

  useEffect(() => {
    const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
    if (!uaData?.getHighEntropyValues) return;
    let cancelled = false;
    uaData
      .getHighEntropyValues(["architecture", "bitness", "platformVersion"])
      .then((v) => {
        if (!cancelled) setHighEntropy(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const groups = useMemo<Array<{ title: string; items: Info[] }>>(() => {
    if (!hydrated) return [];
    void nonce;
    const nav = navigator;
    const uaData = (nav as Navigator & { userAgentData?: UAData }).userAgentData;
    const conn = (nav as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } }).connection;
    const mem = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
    const tz = Intl.DateTimeFormat().resolvedOptions();
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const touch = nav.maxTouchPoints > 0;
    // Clipboard feature detection only; no permission prompt is triggered.
    const canRead = typeof nav.clipboard?.readText === "function";
    const canWrite = typeof nav.clipboard?.writeText === "function";
    const clipboard = `${canWrite ? "write" : "no write"} · ${canRead ? "read" : "no read"} · ${typeof ClipboardItem !== "undefined" ? "images supported" : "text only"}`;
    return [
      {
        title: "Browser",
        items: [
          {
            label: "User agent",
            value: nav.userAgent,
            mono: true,
            hint: "Chromium browsers freeze this string to a generic “Intel Mac OS X” for every Mac, Apple Silicon included — see Architecture (UA-CH) for the real value.",
          },
          { label: "Brands (UA-CH)", value: uaData?.brands?.map((b) => `${b.brand} ${b.version}`).join(", ") || "Not exposed", mono: false },
          { label: "Language", value: nav.language },
          { label: "Languages", value: nav.languages?.join(", ") ?? "" },
          { label: "Cookies enabled", value: nav.cookieEnabled ? "Yes" : "No", mono: false },
          { label: "Do Not Track", value: nav.doNotTrack === "1" ? "Enabled" : "Not set", mono: false },
          { label: "Online", value: online ? "Online" : "Offline", mono: false },
          { label: "Network", value: conn ? `${conn.effectiveType ?? "?"} · ${conn.downlink ?? "?"} Mbps · ${conn.rtt ?? "?"} ms RTT${conn.saveData ? " · data saver" : ""}` : "Not exposed", mono: false },
        ],
      },
      {
        title: "Platform",
        items: [
          { label: "Platform", value: uaData?.platform || nav.platform || "Unknown" },
          {
            label: "Architecture (UA-CH)",
            value: highEntropy?.architecture
              ? `${highEntropy.architecture}${highEntropy.bitness ? ` (${highEntropy.bitness}-bit)` : ""}`
              : uaData?.getHighEntropyValues
                ? "Loading…"
                : "Not exposed (non-Chromium browser)",
            mono: false,
            hint: "The real CPU architecture (e.g. “arm” for Apple Silicon), unlike the frozen User agent string above.",
          },
          { label: "Mobile (UA-CH)", value: uaData?.mobile === undefined ? "Not exposed" : uaData.mobile ? "Yes" : "No", mono: false },
          { label: "Touch points", value: String(nav.maxTouchPoints) + (touch ? " (touch)" : "") },
          { label: "CPU threads", value: nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : "Not exposed" },
          {
            label: "Device memory",
            value: mem ? `≈ ${mem} GB (coarse)` : "Not exposed",
            mono: false,
            hint: "Capped and rounded down to a power of two by the browser for privacy — it won't match installed RAM exactly.",
          },
          { label: "Timezone", value: tz.timeZone },
          { label: "Locale", value: tz.locale },
          { label: "UTC offset", value: `${-new Date().getTimezoneOffset() / 60} h` },
        ],
      },
      {
        title: "Screen",
        items: [
          { label: "Screen size", value: `${screen.width}×${screen.height}` },
          { label: "Available", value: `${screen.availWidth}×${screen.availHeight}` },
          { label: "Viewport", value: viewport },
          { label: "Device pixel ratio", value: String(window.devicePixelRatio) },
          { label: "Physical pixels", value: `${Math.round(screen.width * window.devicePixelRatio)}×${Math.round(screen.height * window.devicePixelRatio)}` },
          { label: "Color depth", value: `${screen.colorDepth}-bit` },
          { label: "Orientation", value: screen.orientation?.type ?? "Unknown" },
          { label: "Prefers", value: `${dark ? "dark" : "light"} scheme${reduced ? " · reduced motion" : ""}`, mono: false },
        ],
      },
      {
        title: "Capabilities",
        items: [
          { label: "Clipboard", value: clipboard, mono: false },
          { label: "Web Crypto", value: typeof crypto !== "undefined" && !!crypto.subtle ? `Yes · randomUUID ${typeof crypto.randomUUID === "function" ? "yes" : "no"}` : "No (insecure context?)", mono: false },
          { label: "Secure context", value: window.isSecureContext ? "Yes (https / localhost)" : "No", mono: false },
          { label: "Service worker", value: "serviceWorker" in nav ? "Supported" : "Not supported", mono: false },
          { label: "WebGL", value: (() => { try { const c = document.createElement("canvas"); return c.getContext("webgl2") ? "WebGL 2" : c.getContext("webgl") ? "WebGL 1" : "No"; } catch { return "No"; } })(), mono: false },
          { label: "Storage", value: `localStorage ${(() => { try { return typeof localStorage !== "undefined" ? "yes" : "no"; } catch { return "blocked"; } })()} · IndexedDB ${"indexedDB" in window ? "yes" : "no"}`, mono: false },
          { label: "Share API", value: typeof nav.share === "function" ? "Yes" : "No", mono: false },
          { label: "PDF viewer", value: nav.pdfViewerEnabled ? "Yes" : "No", mono: false },
        ],
      },
    ];
  }, [hydrated, nonce, viewport, online, highEntropy]);

  const allText = groups.map((g) => `# ${g.title}\n${g.items.map((i) => `${i.label}: ${i.value}`).join("\n")}`).join("\n\n");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">Read locally from navigator, screen and Intl</Badge>
        <Badge>Nothing is sent anywhere</Badge>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <CopyButton value={allText} label="Copy report" />
        </div>
      </div>
      {!hydrated ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-64 skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.title} className="shadow-card">
              <CardHeader title={g.title} />
              <OutputGrid className="sm:grid-cols-1">
                {g.items.map((i) => (
                  <OutputRow key={i.label} label={i.label} value={i.value} mono={i.mono ?? true} hint={i.hint} />
                ))}
              </OutputGrid>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
