import { describe, expect, it } from "vitest";
import { compareUserAgents, isUnrecognisedUserAgent, parseUserAgent, splitUserAgentPaste, UA_COMPARE_SAMPLE, UA_SAMPLE, UA_SAMPLES, userAgentSummary } from "@/lib/tools/user-agent";

function sample(name: string): string {
  const s = UA_SAMPLES.find((x) => x.name === name);
  if (!s) throw new Error(`No sample named ${name}`);
  return s.ua;
}

describe("parseUserAgent: browsers", () => {
  it("parses current Chrome on Windows and flags the reduced UA", () => {
    const r = parseUserAgent(sample("Chrome on Windows"));
    expect(r.browser).toEqual({ name: "Chrome", version: "129.0.0.0", major: "129" });
    expect(r.engine.name).toBe("Blink");
    expect(r.os).toEqual({ name: "Windows", version: "10 / 11" });
    expect(r.device.type).toBe("desktop");
    expect(r.isBot).toBe(false);
    expect(r.flags).toContain("Client Hints reduced UA");
    expect(r.notes.some((n) => /Windows 11/.test(n))).toBe(true);
    expect(r.notes.some((n) => /Brave/.test(n))).toBe(true);
  });

  it("parses Safari on iPhone", () => {
    const r = parseUserAgent(sample("Safari on iPhone"));
    expect(r.browser).toEqual({ name: "Safari", version: "17.6", major: "17" });
    expect(r.engine).toEqual({ name: "WebKit", version: "605.1.15" });
    expect(r.os).toEqual({ name: "iOS", version: "17.6.1" });
    expect(r.device).toEqual({ type: "mobile", vendor: "Apple", model: "iPhone" });
    expect(r.flags).toEqual([]);
  });

  it("parses Firefox on Linux with a distro and Gecko", () => {
    const r = parseUserAgent(sample("Firefox on Linux"));
    expect(r.browser.name).toBe("Firefox");
    expect(r.browser.major).toBe("130");
    expect(r.engine).toEqual({ name: "Gecko", version: "130.0" });
    expect(r.os).toEqual({ name: "Linux", version: "Ubuntu" });
    expect(r.device.type).toBe("desktop");
  });

  it("detects Edge before Chrome and notes the frozen macOS version", () => {
    const r = parseUserAgent(sample("Edge on macOS"));
    expect(r.browser).toEqual({ name: "Edge", version: "129.0.2792.52", major: "129" });
    expect(r.engine.name).toBe("Blink");
    expect(r.os).toEqual({ name: "macOS", version: "10.15.7" });
    expect(r.flags).toContain("Chromium-based");
    expect(r.notes.some((n) => /10\.15\.7/.test(n))).toBe(true);
    expect(r.notes.some((n) => /iPadOS 13/.test(n))).toBe(true);
  });

  it("detects Samsung Internet with the Samsung model", () => {
    const r = parseUserAgent(sample("Samsung Internet"));
    expect(r.browser.name).toBe("Samsung Internet");
    expect(r.browser.major).toBe("26");
    expect(r.os).toEqual({ name: "Android", version: "14" });
    expect(r.device).toEqual({ type: "mobile", vendor: "Samsung", model: "SAMSUNG SM-S928B" });
  });

  it("detects an Android WebView inside Instagram", () => {
    const r = parseUserAgent(sample("Android WebView (Instagram)"));
    expect(r.browser.name).toBe("Chrome");
    expect(r.device).toEqual({ type: "mobile", vendor: "Google", model: "Pixel 7" });
    expect(r.flags).toContain("WebView");
    expect(r.flags).toContain("In-app browser: Instagram");
    expect(r.evidence.some((e) => e.token === "; wv)")).toBe(true);
  });

  it("detects Firefox on iOS as a WebKit shell", () => {
    const r = parseUserAgent(sample("Firefox on iOS"));
    expect(r.browser.name).toBe("Firefox");
    expect(r.browser.major).toBe("129");
    expect(r.engine.name).toBe("WebKit");
    expect(r.os.name).toBe("iOS");
  });

  it("detects Internet Explorer 11 via Trident and maps NT 6.1 to Windows 7", () => {
    const r = parseUserAgent(sample("Internet Explorer 11"));
    expect(r.browser).toEqual({ name: "Internet Explorer", version: "11.0", major: "11" });
    expect(r.engine).toEqual({ name: "Trident", version: "7.0" });
    expect(r.os).toEqual({ name: "Windows", version: "7" });
  });

  it("detects the legacy iPad UA as a tablet on iPadOS", () => {
    const r = parseUserAgent(sample("Safari on iPad (legacy UA)"));
    expect(r.browser.name).toBe("Safari");
    expect(r.os).toEqual({ name: "iPadOS", version: "12.5.7" });
    expect(r.device).toEqual({ type: "tablet", vendor: "Apple", model: "iPad" });
  });

  it("detects Electron apps and the embedded Chromium", () => {
    const r = parseUserAgent(sample("Electron app"));
    expect(r.browser).toEqual({ name: "Electron", version: "30.4.0", major: "30" });
    expect(r.engine).toEqual({ name: "Blink", version: "124.0.6367.243" });
    expect(r.flags).toContain("Electron app");
    expect(r.device.type).toBe("desktop");
  });

  it("flags the reduced Android UA and drops the fake model", () => {
    const r = parseUserAgent(sample("Reduced Android UA"));
    expect(r.os).toEqual({ name: "Android", version: "10" });
    expect(r.device.model).toBeUndefined();
    expect(r.flags).toContain("Client Hints reduced UA");
  });
});

describe("parseUserAgent: bots and tools", () => {
  it("identifies Googlebot despite the Mozilla prefix", () => {
    const r = parseUserAgent(sample("Googlebot"));
    expect(r.isBot).toBe(true);
    expect(r.browser).toEqual({ name: "Googlebot", version: "2.1", major: "2" });
    expect(r.device.type).toBe("bot");
    expect(r.flags).toContain("Search / AI crawler");
  });

  it("identifies curl and Postman as HTTP clients", () => {
    const curl = parseUserAgent(sample("curl"));
    expect(curl).toMatchObject({ isBot: true, browser: { name: "curl", version: "8.7.1" }, device: { type: "bot" } });
    expect(curl.flags).toContain("HTTP client / script");
    const postman = parseUserAgent(sample("Postman"));
    expect(postman.browser).toEqual({ name: "Postman", version: "7.42.0", major: "7" });
    expect(postman.isBot).toBe(true);
  });

  it("treats Headless Chrome as a browser with a Headless flag, not a bot", () => {
    const r = parseUserAgent(sample("Chrome Headless"));
    expect(r.isBot).toBe(false);
    expect(r.browser.name).toBe("Chrome Headless");
    expect(r.browser.major).toBe("128");
    expect(r.flags).toContain("Headless");
    expect(r.os.name).toBe("Linux");
  });

  it("recognises social previewers and generic bots", () => {
    expect(parseUserAgent("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)").browser.name).toBe("Slackbot");
    expect(parseUserAgent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)").browser.name).toBe("Facebook crawler");
    expect(parseUserAgent("Mozilla/5.0 (compatible; SomethingNew crawler/1.0)").browser.name).toBe("Unknown bot");
    expect(parseUserAgent("python-requests/2.32.3").browser.version).toBe("2.32.3");
    expect(parseUserAgent("Go-http-client/2.0").browser.name).toBe("Go http client");
  });
});

describe("parseUserAgent: devices, OS and edge cases", () => {
  it("maps consoles and TVs", () => {
    expect(parseUserAgent("Mozilla/5.0 (PlayStation; PlayStation 5/8.20) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15").device).toEqual({ type: "console", vendor: "Sony" });
    const tv = parseUserAgent("Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.5 TV Safari/537.36");
    expect(tv.device).toEqual({ type: "tv", vendor: "Samsung" });
    expect(tv.os).toEqual({ name: "Tizen", version: "6.5" });
  });

  it("detects ChromeOS, Windows 8.1 and Android tablets", () => {
    expect(parseUserAgent("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36").os).toEqual({ name: "ChromeOS", version: "14541.0.0" });
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 6.3; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0").os.version).toBe("8.1");
    const tab = parseUserAgent("Mozilla/5.0 (Linux; Android 13; SM-X710 Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36");
    expect(tab.device).toEqual({ type: "tablet", vendor: "Samsung", model: "SM-X710" });
  });

  it("flags iOS WKWebViews and in-app browsers without a Safari token", () => {
    const r = parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/430.0.0.0]");
    expect(r.flags).toContain("WebView");
    expect(r.flags).toContain("In-app browser: Facebook");
    expect(r.browser.name).toBe("WebKit-based browser");
  });

  it("handles empty, junk and oversized input without throwing", () => {
    expect(parseUserAgent("")).toMatchObject({ browser: { name: "Unknown" }, device: { type: "unknown" }, isBot: false });
    expect(parseUserAgent("hello world").browser.name).toBe("Unknown");
    expect(() => parseUserAgent("Mozilla/5.0 ".repeat(5000))).not.toThrow();
  });

  it("records evidence tokens and ships a valid sample list", () => {
    const r = parseUserAgent(UA_SAMPLE);
    expect(r.evidence.map((e) => e.what)).toEqual(expect.arrayContaining(["Browser", "OS", "Engine"]));
    expect(UA_SAMPLES.length).toBeGreaterThanOrEqual(12);
    for (const s of UA_SAMPLES) expect(parseUserAgent(s.ua).browser.name).not.toBe("Unknown");
  });
});

describe("compareUserAgents", () => {
  it("summarises each sample UA in one line", () => {
    const [desktop, iphone, android] = UA_COMPARE_SAMPLE.map(parseUserAgent);
    expect(userAgentSummary(desktop)).toBe("Chrome 129 · Windows 10 / 11 · desktop");
    expect(userAgentSummary(iphone)).toBe("Safari 17 · iOS 17.6.1 · mobile");
    expect(userAgentSummary(android)).toMatch(/^Chrome 129 · Android 14 · mobile$/);
  });

  it("flags fields that differ from the first UA", () => {
    const rows = compareUserAgents(UA_COMPARE_SAMPLE.map(parseUserAgent));
    const row = (key: string) => rows.find((r) => r.key === key)!;
    expect(row("browser").values).toEqual(["Chrome", "Safari", "Chrome"]);
    expect(row("browser").differs).toEqual([false, true, false]);
    expect(row("browser").same).toBe(false);
    expect(row("device").differs).toEqual([false, true, true]);
    expect(row("bot").same).toBe(true);
  });

  it("treats identical UAs as all-same", () => {
    const rows = compareUserAgents([UA_SAMPLE, UA_SAMPLE].map(parseUserAgent));
    expect(rows.every((r) => r.same)).toBe(true);
  });

  it("splits pasted lists on newlines only and spots junk", () => {
    expect(splitUserAgentPaste("a b c\r\n\n  d e  \n")).toEqual(["a b c", "d e"]);
    expect(isUnrecognisedUserAgent(parseUserAgent("hello there"))).toBe(true);
    expect(isUnrecognisedUserAgent(parseUserAgent("curl/8.7.1"))).toBe(false);
  });
});
