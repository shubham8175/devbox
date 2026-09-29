import { describe, expect, it } from "vitest";
import { detectDesktopOs, detectMobileOs, isDesktopApp } from "@/lib/desktop";
import { manualInstallHint } from "@/lib/pwa";
import { DESKTOP_DOWNLOAD_URLS, DESKTOP_RELEASES_URL, INSTALL_GUIDE_URL, REPO_URL } from "@/lib/site";

describe("isDesktopApp", () => {
  it("is false outside a browser", () => {
    expect(isDesktopApp()).toBe(false);
  });
});

describe("detectDesktopOs", () => {
  it("recognises Windows", () => {
    expect(detectDesktopOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36")).toBe("windows");
  });
  it("recognises macOS", () => {
    expect(detectDesktopOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36")).toBe("macos");
  });
  it("does not treat an iPad in desktop mode as a Mac", () => {
    expect(detectDesktopOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", 5)).toBe("other");
  });
  it("recognises Windows in every major browser", () => {
    const uas = {
      edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
      firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
      opera: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0",
      brave: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      windows11Arm: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    };
    for (const ua of Object.values(uas)) expect(detectDesktopOs(ua)).toBe("windows");
  });
  it("recognises macOS in every major browser", () => {
    const uas = {
      safari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:126.0) Gecko/20100101 Firefox/126.0",
      edge: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
      arc: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    };
    for (const ua of Object.values(uas)) expect(detectDesktopOs(ua, 0)).toBe("macos");
  });
  it("falls back to other for phones and Linux", () => {
    expect(detectDesktopOs("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36")).toBe("other");
    expect(detectDesktopOs("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe("other");
    expect(detectDesktopOs("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36")).toBe("other");
  });
});

describe("detectMobileOs", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  const ipadDesktopMode = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36";
  const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36";

  it("recognises iPhone and Android", () => {
    expect(detectMobileOs(iphone)).toBe("ios");
    expect(detectMobileOs(android)).toBe("android");
  });
  it("treats an iPad in desktop mode as iOS, but not a real Mac", () => {
    expect(detectMobileOs(ipadDesktopMode, 5)).toBe("ios");
    expect(detectMobileOs(mac, 0)).toBe(null);
  });
  it("is null on desktops", () => {
    expect(detectMobileOs(windows)).toBe(null);
    expect(detectMobileOs("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36")).toBe(null);
  });
  it("never overlaps with a desktop installer offer", () => {
    for (const ua of [iphone, android]) {
      expect(detectDesktopOs(ua)).toBe("other");
    }
    expect(detectDesktopOs(ipadDesktopMode, 5)).toBe("other");
  });
  it("gives platform-specific install steps", () => {
    expect(manualInstallHint(iphone)).toContain("Add to Home Screen");
    expect(manualInstallHint(android)).toContain("Add to Home screen");
    expect(manualInstallHint(mac)).toContain("Install");
  });
});

describe("desktop download URLs", () => {
  it("point straight at fixed-name installers on the latest release", () => {
    expect(DESKTOP_DOWNLOAD_URLS.macos).toBe(`${DESKTOP_RELEASES_URL}/download/DevBox-macOS.dmg`);
    expect(DESKTOP_DOWNLOAD_URLS.windows).toBe(`${DESKTOP_RELEASES_URL}/download/DevBox-Windows-Setup.exe`);
  });
  it("point the install guide at the README's Download section", async () => {
    const { readFileSync } = await import("node:fs");
    expect(INSTALL_GUIDE_URL).toBe(`${REPO_URL}#download`);
    expect(DESKTOP_RELEASES_URL.startsWith(REPO_URL)).toBe(true);
    expect(readFileSync("README.md", "utf8")).toMatch(/^## Download$/m);
  });
  it("use the same asset names the release workflow publishes", async () => {
    const { readFileSync } = await import("node:fs");
    const workflow = readFileSync(".github/workflows/desktop-release.yml", "utf8");
    expect(workflow).toContain("installers/DevBox-macOS.dmg");
    expect(workflow).toContain("installers/DevBox-Windows-Setup.exe");
    expect(workflow).toContain("draft: false");
  });
});
