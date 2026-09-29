import { describe, expect, it } from "vitest";
import { detectDesktopOs, isDesktopApp } from "@/lib/desktop";

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
  it("falls back to other for phones and Linux", () => {
    expect(detectDesktopOs("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36")).toBe("other");
    expect(detectDesktopOs("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe("other");
    expect(detectDesktopOs("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36")).toBe("other");
  });
});
