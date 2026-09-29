export const SITE_URL = "https://devbox.voyra.co.in";

/** GitHub Releases page for the Tauri desktop app; fallback when the visitor's OS is unknown. */
export const DESKTOP_RELEASES_URL = "https://github.com/shubham8175/devbox/releases/latest";

/**
 * Direct installer downloads. GitHub redirects `releases/latest/download/<file>` to that asset
 * on the newest published release, so the file names must stay stable across versions:
 * `.github/workflows/desktop-release.yml` renames the built installers to exactly these.
 */
export const DESKTOP_DOWNLOAD_URLS = {
  macos: `${DESKTOP_RELEASES_URL}/download/DevBox-macOS.dmg`,
  windows: `${DESKTOP_RELEASES_URL}/download/DevBox-Windows-Setup.exe`,
} as const;

export const SITE_DESCRIPTION =
  "Free developer tools for JSON, APIs, regex, JWTs, images and more. Everything is processed in your browser, and no account is required.";
