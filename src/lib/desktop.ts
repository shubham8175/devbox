/**
 * Desktop (Tauri) detection and helpers. Everything desktop-specific in the
 * frontend must be behind `isDesktopApp()` so the web build never changes
 * behaviour.
 */

/**
 * The Tauri runtime injects `__TAURI_INTERNALS__` into every webview before
 * any page script runs, so this is a reliable, dependency-free check.
 */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type DesktopOs = "macos" | "windows" | "other";

/** Which desktop installer to offer, from the user agent. iPads report "Macintosh" but have touch points. */
export function detectDesktopOs(ua: string, maxTouchPoints = 0): DesktopOs {
  if (/Windows NT/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua) && maxTouchPoints <= 1 && !/iPhone|iPad|iPod/.test(ua)) return "macos";
  return "other";
}
