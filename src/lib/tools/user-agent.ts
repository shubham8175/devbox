/**
 * User-Agent parser: regex-based detection of browser, engine, OS and device.
 * UA strings are famously unreliable (frozen versions, Client Hints
 * reduction, spoofing), so results carry the matched tokens and caveats.
 */

export type DeviceType = "desktop" | "mobile" | "tablet" | "bot" | "tv" | "console" | "unknown";

export interface UaEvidence {
  what: string;
  token: string;
}

export interface ParsedUserAgent {
  browser: { name: string; version: string; major: string };
  engine: { name: string; version: string };
  os: { name: string; version: string };
  device: { type: DeviceType; vendor?: string; model?: string };
  isBot: boolean;
  flags: string[];
  notes: string[];
  evidence: UaEvidence[];
}

const MAX_UA = 4000;

function major(v: string): string {
  return v.split(".")[0] ?? "";
}

function ver(ua: string, re: RegExp): string {
  const m = ua.match(re);
  return m?.[1]?.replace(/_/g, ".") ?? "";
}

const BOTS: Array<{ re: RegExp; name: string; kind: "crawler" | "social" | "tool" | "monitor" }> = [
  { re: /Googlebot(?:-Image|-News|-Video)?\/?([\d.]*)/i, name: "Googlebot", kind: "crawler" },
  { re: /Google-InspectionTool|AdsBot-Google|Mediapartners-Google|APIs-Google|Google-Extended|GoogleOther/i, name: "Google crawler", kind: "crawler" },
  { re: /bingbot\/?([\d.]*)/i, name: "Bingbot", kind: "crawler" },
  { re: /DuckDuckBot|DuckDuckGo-Favicons-Bot/i, name: "DuckDuckBot", kind: "crawler" },
  { re: /Baiduspider/i, name: "Baiduspider", kind: "crawler" },
  { re: /YandexBot|YandexImages/i, name: "YandexBot", kind: "crawler" },
  { re: /Applebot\/?([\d.]*)/i, name: "Applebot", kind: "crawler" },
  { re: /Slurp/i, name: "Yahoo Slurp", kind: "crawler" },
  { re: /GPTBot|ChatGPT-User|OAI-SearchBot/i, name: "OpenAI crawler", kind: "crawler" },
  { re: /ClaudeBot|anthropic-ai|Claude-Web/i, name: "Anthropic crawler", kind: "crawler" },
  { re: /PerplexityBot|CCBot|Bytespider|Amazonbot|PetalBot|SemrushBot|AhrefsBot|MJ12bot|DotBot/i, name: "SEO/AI crawler", kind: "crawler" },
  { re: /Slackbot(?:-LinkExpanding)?\/?([\d.]*)/i, name: "Slackbot", kind: "social" },
  { re: /Twitterbot\/?([\d.]*)/i, name: "Twitterbot", kind: "social" },
  { re: /facebookexternalhit\/?([\d.]*)|Facebot/i, name: "Facebook crawler", kind: "social" },
  { re: /LinkedInBot\/?([\d.]*)/i, name: "LinkedInBot", kind: "social" },
  { re: /Discordbot\/?([\d.]*)/i, name: "Discordbot", kind: "social" },
  { re: /TelegramBot/i, name: "TelegramBot", kind: "social" },
  { re: /WhatsApp\/?([\d.]*)/i, name: "WhatsApp link preview", kind: "social" },
  { re: /Pinterestbot|Pinterest\//i, name: "Pinterestbot", kind: "social" },
  { re: /UptimeRobot|Pingdom|StatusCake|Site24x7|Datadog|NewRelicPinger|Better ?Uptime/i, name: "Uptime monitor", kind: "monitor" },
  { re: /Lighthouse|Chrome-Lighthouse|PageSpeed/i, name: "Lighthouse / PageSpeed", kind: "monitor" },
  { re: /\bcurl\/([\d.]+)/i, name: "curl", kind: "tool" },
  { re: /\bWget\/([\d.]+)/i, name: "Wget", kind: "tool" },
  { re: /python-requests\/([\d.]+)/i, name: "python-requests", kind: "tool" },
  { re: /python-urllib\/([\d.]+)|python-httpx\/([\d.]+)|aiohttp\/([\d.]+)/i, name: "Python HTTP client", kind: "tool" },
  { re: /\baxios\/([\d.]+)/i, name: "axios", kind: "tool" },
  { re: /PostmanRuntime\/([\d.]+)/i, name: "Postman", kind: "tool" },
  { re: /insomnia\/([\d.]+)/i, name: "Insomnia", kind: "tool" },
  { re: /Go-http-client\/([\d.]+)/i, name: "Go http client", kind: "tool" },
  { re: /node-fetch\/?([\d.]*)|undici|Node\.js\/?([\d.]*)/i, name: "Node.js fetch", kind: "tool" },
  { re: /\bokhttp\/([\d.]+)/i, name: "OkHttp", kind: "tool" },
  { re: /Apache-HttpClient\/([\d.]+)|\bJava\/([\d._]+)/i, name: "Java HTTP client", kind: "tool" },
  { re: /\bDart\/([\d.]+)/i, name: "Dart HTTP client", kind: "tool" },
  { re: /HTTPie\/([\d.]+)/i, name: "HTTPie", kind: "tool" },
  { re: /libwww-perl\/([\d.]+)|LWP::Simple/i, name: "Perl LWP", kind: "tool" },
  { re: /Ruby|rest-client\/([\d.]+)|Faraday v([\d.]+)/i, name: "Ruby HTTP client", kind: "tool" },
  { re: /\bPHP\/([\d.]+)|GuzzleHttp\/([\d.]+)/i, name: "PHP HTTP client", kind: "tool" },
  { re: /Scrapy\/([\d.]+)/i, name: "Scrapy", kind: "tool" },
  { re: /HeadlessChrome\/([\d.]+)/i, name: "Headless Chrome", kind: "tool" },
  { re: /PhantomJS\/([\d.]+)/i, name: "PhantomJS", kind: "tool" },
  { re: /\b(?:bot|crawler|spider|crawling|scraper)\b/i, name: "Unknown bot", kind: "crawler" },
];

interface BrowserRule {
  name: string;
  re: RegExp;
}

// Order matters: Chromium forks announce themselves after "Chrome/", and every WebKit browser says "Safari".
const BROWSERS: BrowserRule[] = [
  { name: "Edge", re: /\bEdg(?:e|A|iOS)?\/([\d.]+)/ },
  { name: "Opera", re: /\b(?:OPR|OPiOS|OPT|Opera)\/([\d.]+)/ },
  { name: "Samsung Internet", re: /SamsungBrowser\/([\d.]+)/ },
  { name: "Vivaldi", re: /Vivaldi\/([\d.]+)/ },
  { name: "Yandex Browser", re: /YaBrowser\/([\d.]+)/ },
  { name: "UC Browser", re: /UCBrowser\/([\d.]+)/ },
  { name: "Whale", re: /Whale\/([\d.]+)/ },
  { name: "DuckDuckGo", re: /DuckDuckGo\/([\d.]+)/ },
  { name: "Arc", re: /\bArc\/([\d.]+)/ },
  { name: "Firefox", re: /\b(?:Firefox|FxiOS|Fennec|Focus)\/([\d.]+)/ },
  { name: "Electron", re: /Electron\/([\d.]+)/ },
  { name: "Chrome", re: /\b(?:CriOS|Chrome|Chromium|HeadlessChrome)\/([\d.]+)/ },
  { name: "Internet Explorer", re: /\bMSIE ([\d.]+)|\bTrident\/[\d.]+.*?rv:([\d.]+)/ },
  { name: "Safari", re: /Version\/([\d.]+).*?\bSafari\// },
];

const WINDOWS: Record<string, string> = { "10.0": "10 / 11", "6.3": "8.1", "6.2": "8", "6.1": "7", "6.0": "Vista", "5.2": "XP x64 / Server 2003", "5.1": "XP", "5.0": "2000" };

const IN_APP: Array<{ re: RegExp; name: string }> = [
  { re: /Instagram/i, name: "Instagram" },
  { re: /\bFBAN\b|\bFBAV\b|\bFB_IAB\b|FBIOS/i, name: "Facebook" },
  { re: /Messenger|\bFBAN\/MessengerForiOS/i, name: "Messenger" },
  { re: /\bLine\/[\d.]+/i, name: "LINE" },
  { re: /MicroMessenger/i, name: "WeChat" },
  { re: /Twitter/i, name: "Twitter / X" },
  { re: /Snapchat/i, name: "Snapchat" },
  { re: /TikTok|musical_ly|BytedanceWebview/i, name: "TikTok" },
  { re: /LinkedInApp/i, name: "LinkedIn" },
  { re: /\bGSA\/[\d.]+/i, name: "Google app" },
  { re: /Pinterest\/(?:iOS|Android)/i, name: "Pinterest" },
  { re: /\bTeams\//i, name: "Microsoft Teams" },
  { re: /\bSlack(?:_SSB)?\//i, name: "Slack" },
];

function detectOs(ua: string, ev: UaEvidence[]): { name: string; version: string; notes: string[]; flags: string[] } {
  const notes: string[] = [];
  const flags: string[] = [];
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Windows Phone(?: OS)? ([\d.]+)/))) {
    ev.push({ what: "OS", token: m[0] });
    return { name: "Windows Phone", version: m[1], notes, flags };
  }
  if ((m = ua.match(/Windows NT ([\d.]+)/))) {
    ev.push({ what: "OS", token: m[0] });
    const mapped = WINDOWS[m[1]];
    if (m[1] === "10.0") notes.push("Windows 11 still reports NT 10.0; the UA cannot tell 10 and 11 apart (use Client Hints: Sec-CH-UA-Platform-Version).");
    return { name: "Windows", version: mapped ?? `NT ${m[1]}`, notes, flags };
  }
  if (/\bWindows\b/.test(ua)) {
    ev.push({ what: "OS", token: "Windows" });
    return { name: "Windows", version: "", notes, flags };
  }
  if ((m = ua.match(/CrOS (\S+) ([\d.]+)/))) {
    ev.push({ what: "OS", token: m[0] });
    return { name: "ChromeOS", version: m[2], notes, flags };
  }
  if ((m = ua.match(/Android[ /]?([\d.]*)/))) {
    ev.push({ what: "OS", token: m[0] });
    if (/Android 10; K\b/.test(ua)) {
      flags.push("Client Hints reduced UA");
      notes.push("Chrome 110+ freezes the Android UA to “Android 10; K”: the real version and model are only in Client Hints.");
    }
    return { name: "Android", version: m[1], notes, flags };
  }
  if ((m = ua.match(/(iPhone|iPad|iPod)(?:[^)]*?)OS ([\d_]+)/))) {
    ev.push({ what: "OS", token: m[0].slice(0, 40) });
    return { name: m[1] === "iPad" ? "iPadOS" : "iOS", version: m[2].replace(/_/g, "."), notes, flags };
  }
  if (/\b(iPhone|iPod)\b/.test(ua)) {
    ev.push({ what: "OS", token: "iPhone" });
    return { name: "iOS", version: "", notes, flags };
  }
  if (/\biPad\b/.test(ua)) {
    ev.push({ what: "OS", token: "iPad" });
    return { name: "iPadOS", version: "", notes, flags };
  }
  if (/AppleTV|tvOS/.test(ua)) {
    ev.push({ what: "OS", token: "AppleTV" });
    return { name: "tvOS", version: ver(ua, /tvOS[ /]([\d._]+)/), notes, flags };
  }
  if ((m = ua.match(/Mac OS X ([\d_.]+)/))) {
    ev.push({ what: "OS", token: m[0] });
    const v = m[1].replace(/_/g, ".");
    if (v === "10.15.7" || v === "10.15") {
      notes.push("Chrome, Safari and Firefox freeze the macOS version at 10.15.7 (Catalina); the real version is not in the UA.");
      notes.push("iPadOS 13+ Safari reports itself as a Macintosh by default, so an iPad can look like a Mac here (only touch support distinguishes them).");
    }
    return { name: "macOS", version: v, notes, flags };
  }
  if (/Macintosh|Mac_PowerPC/.test(ua)) {
    ev.push({ what: "OS", token: "Macintosh" });
    return { name: "macOS", version: "", notes, flags };
  }
  if (/PlayStation 5/.test(ua)) return { name: "PlayStation 5", version: ver(ua, /PlayStation 5\/([\d.]+)/), notes, flags };
  if (/PlayStation 4/.test(ua)) return { name: "PlayStation 4", version: ver(ua, /PlayStation 4\/([\d.]+)/), notes, flags };
  if (/Xbox/.test(ua)) return { name: "Xbox", version: "", notes, flags };
  if (/Nintendo Switch/.test(ua)) return { name: "Nintendo Switch", version: "", notes, flags };
  if ((m = ua.match(/Tizen[ /]([\d.]+)/))) return { name: "Tizen", version: m[1], notes, flags };
  if (/Web0S|webOS/.test(ua)) return { name: "webOS", version: ver(ua, /(?:Web0S|webOS)[^;]*?\/([\d.]+)/), notes, flags };
  if (/Roku/.test(ua)) return { name: "Roku OS", version: ver(ua, /Roku\/DVP-([\d.]+)/), notes, flags };
  if ((m = ua.match(/\b(Ubuntu|Fedora|Debian|Arch|Manjaro|CentOS|Red Hat|SUSE|Gentoo|Mint)\b/))) {
    ev.push({ what: "OS", token: m[0] });
    return { name: "Linux", version: m[1], notes, flags };
  }
  if (/\bLinux\b|X11/.test(ua)) {
    ev.push({ what: "OS", token: "Linux" });
    return { name: "Linux", version: "", notes, flags };
  }
  if (/FreeBSD|OpenBSD|NetBSD/.test(ua)) return { name: ua.match(/(FreeBSD|OpenBSD|NetBSD)/)?.[1] ?? "BSD", version: "", notes, flags };
  return { name: "Unknown", version: "", notes, flags };
}

function detectEngine(ua: string, browser: string, ev: UaEvidence[]): { name: string; version: string } {
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/\bEdge\/([\d.]+)/))) {
    ev.push({ what: "Engine", token: m[0] });
    return { name: "EdgeHTML", version: m[1] };
  }
  if ((m = ua.match(/Trident\/([\d.]+)/))) {
    ev.push({ what: "Engine", token: m[0] });
    return { name: "Trident", version: m[1] };
  }
  if ((m = ua.match(/\bPresto\/([\d.]+)/))) {
    ev.push({ what: "Engine", token: m[0] });
    return { name: "Presto", version: m[1] };
  }
  if ((m = ua.match(/\bGecko\/\S+.*?rv:([\d.]+)|rv:([\d.]+)\)? Gecko\//))) {
    ev.push({ what: "Engine", token: "Gecko" });
    return { name: "Gecko", version: m[1] ?? m[2] ?? "" };
  }
  const iOS = /\b(?:iPhone|iPad|iPod)\b/.test(ua);
  // Firefox for iOS (FxiOS) is a WebKit shell like every other iOS browser; only desktop/Android builds ship Gecko.
  if (browser === "Firefox" && !iOS) return { name: "Gecko", version: ver(ua, /Firefox\/([\d.]+)/) };
  if ((m = ua.match(/\b(?:Chrome|Chromium|CriOS|HeadlessChrome)\/([\d.]+)/))) {
    // Every browser on iOS must use the system WebKit; Blink only exists elsewhere (and only since Chrome 28).
    if (iOS) {
      ev.push({ what: "Engine", token: "AppleWebKit (iOS)" });
      return { name: "WebKit", version: ver(ua, /AppleWebKit\/([\d.]+)/) };
    }
    ev.push({ what: "Engine", token: m[0] });
    return { name: Number(major(m[1])) >= 28 ? "Blink" : "WebKit", version: m[1] };
  }
  if ((m = ua.match(/AppleWebKit\/([\d.]+)/))) {
    ev.push({ what: "Engine", token: m[0] });
    return { name: "WebKit", version: m[1] };
  }
  if (/KHTML/.test(ua)) return { name: "KHTML", version: "" };
  return { name: "Unknown", version: "" };
}

function detectDevice(ua: string, os: string, isBot: boolean, ev: UaEvidence[]): ParsedUserAgent["device"] {
  if (isBot) return { type: "bot" };
  let m: RegExpMatchArray | null;
  if (/PlayStation|Xbox|Nintendo/.test(ua)) return { type: "console", vendor: /PlayStation/.test(ua) ? "Sony" : /Xbox/.test(ua) ? "Microsoft" : "Nintendo" };
  if (/SMART-TV|SmartTV|Tizen|Web0S|webOS|AppleTV|tvOS|Roku|BRAVIA|GoogleTV|Android TV|CrKey|HbbTV|NetCast|VIERA|AFTM|AFTT|AFTS/i.test(ua)) {
    const vendor = /AppleTV|tvOS/.test(ua) ? "Apple" : /Roku/.test(ua) ? "Roku" : /Tizen|SMART-TV/i.test(ua) ? "Samsung" : /Web0S|webOS/.test(ua) ? "LG" : /AFT/.test(ua) ? "Amazon" : undefined;
    return { type: "tv", vendor };
  }
  if ((m = ua.match(/\b(iPhone|iPod)\b/))) return { type: "mobile", vendor: "Apple", model: m[1] };
  if (/\biPad\b/.test(ua)) return { type: "tablet", vendor: "Apple", model: "iPad" };
  if (os === "Android") {
    const mobile = /\bMobile\b/.test(ua);
    const model = ua.match(/Android[ /]?[\d.]*;\s*(?:[a-z]{2}-[a-zA-Z]{2};\s*)?([^;)]+?)(?:\s+Build\/|\)|;)/)?.[1]?.trim();
    const cleaned = model && model !== "K" && !/^(?:wv|Mobile|Tablet)$/i.test(model) ? model : undefined;
    if (cleaned) ev.push({ what: "Model", token: cleaned });
    let vendor: string | undefined;
    if (cleaned) {
      if (/^SM-|^GT-|^SAMSUNG/i.test(cleaned)) vendor = "Samsung";
      else if (/^Pixel/i.test(cleaned)) vendor = "Google";
      else if (/^(?:M|Mi|Redmi|POCO|2[0-9]{3,})/i.test(cleaned) && /Mi|Redmi|POCO|^2\d{9}[A-Z]/i.test(cleaned)) vendor = "Xiaomi";
      else if (/^(?:CPH|OPPO)/i.test(cleaned)) vendor = "OPPO";
      else if (/^(?:V\d{4}|vivo)/i.test(cleaned)) vendor = "vivo";
      else if (/^(?:ONEPLUS|[A-Z]{2}\d{4}$)/i.test(cleaned) && /ONEPLUS|^[A-Z]{2}\d{4}$/.test(cleaned)) vendor = "OnePlus";
      else if (/^(?:moto|XT\d)/i.test(cleaned)) vendor = "Motorola";
      else if (/^(?:Nokia)/i.test(cleaned)) vendor = "Nokia";
      else if (/^(?:HUAWEI|ELE-|LYA-|VOG-|ANA-|NOH-)/i.test(cleaned)) vendor = "Huawei";
      else if (/^(?:Lenovo|TB-)/i.test(cleaned)) vendor = "Lenovo";
      else if (/^(?:SH-|SHV)/i.test(cleaned)) vendor = "Sharp";
      else if (/Nexus/i.test(cleaned)) vendor = "Google";
    }
    return { type: mobile ? "mobile" : "tablet", vendor, model: cleaned };
  }
  if (/Windows Phone|\bIEMobile\b/.test(ua)) return { type: "mobile", vendor: "Microsoft" };
  if (/\bTablet\b|Kindle|Silk\//.test(ua)) return { type: "tablet", vendor: /Kindle|Silk/.test(ua) ? "Amazon" : undefined };
  if (/\bMobile\b|Mobi\b|Opera Mini/.test(ua)) return { type: "mobile" };
  if (/Macintosh/.test(ua)) return { type: "desktop", vendor: "Apple" };
  if (os === "Windows" || os === "Linux" || os === "ChromeOS" || os === "macOS" || /BSD/.test(os)) return { type: "desktop" };
  return { type: "unknown" };
}

export function parseUserAgent(input: string): ParsedUserAgent {
  const ua = input.trim().slice(0, MAX_UA);
  const evidence: UaEvidence[] = [];
  const flags: string[] = [];
  const notes: string[] = [];
  const empty = (): ParsedUserAgent => ({
    browser: { name: "Unknown", version: "", major: "" },
    engine: { name: "Unknown", version: "" },
    os: { name: "Unknown", version: "" },
    device: { type: "unknown" },
    isBot: false,
    flags,
    notes,
    evidence,
  });
  if (!ua) return empty();

  // Bots and HTTP tools first: many spoof a browser prefix ("Mozilla/5.0 (compatible; Googlebot/2.1; …)").
  let bot: { name: string; version: string; kind: string } | null = null;
  for (const b of BOTS) {
    const m = ua.match(b.re);
    if (m) {
      const version = m.slice(1).find((g) => typeof g === "string" && g.length > 0) ?? "";
      bot = { name: b.name, version, kind: b.kind };
      evidence.push({ what: "Bot", token: m[0] });
      break;
    }
  }
  if (bot && bot.name === "Headless Chrome") bot = null; // handled as a browser flag below

  let browser = { name: "Unknown", version: "", major: "" };
  if (bot) {
    browser = { name: bot.name, version: bot.version, major: major(bot.version) };
    flags.push(bot.kind === "tool" ? "HTTP client / script" : bot.kind === "social" ? "Link preview bot" : bot.kind === "monitor" ? "Monitoring / audit" : "Search / AI crawler");
  } else {
    for (const rule of BROWSERS) {
      const m = ua.match(rule.re);
      if (m) {
        const version = m.slice(1).find((g) => typeof g === "string" && g.length > 0) ?? "";
        browser = { name: rule.name, version, major: major(version) };
        evidence.push({ what: "Browser", token: m[0].slice(0, 40) });
        break;
      }
    }
    if (browser.name === "Unknown" && /AppleWebKit/.test(ua)) {
      browser = { name: "WebKit-based browser", version: "", major: "" };
      notes.push("No browser token: on iOS this is usually a WKWebView inside an app.");
    }
  }

  const os = detectOs(ua, evidence);
  notes.push(...os.notes);
  flags.push(...os.flags);
  const engine = detectEngine(ua, browser.name, evidence);
  const device = detectDevice(ua, os.name, bot !== null, evidence);

  // Flags
  if (/HeadlessChrome/.test(ua)) {
    flags.push("Headless");
    browser.name = "Chrome Headless";
    evidence.push({ what: "Flag", token: "HeadlessChrome" });
  }
  if (/Electron\//.test(ua) && browser.name !== "Electron") flags.push("Electron");
  if (browser.name === "Electron") {
    flags.push("Electron app");
    notes.push("Electron apps embed Chromium; the Chrome/ token gives the Chromium version.");
  }
  if (engine.name === "Blink" && browser.name !== "Chrome" && browser.name !== "Chrome Headless") flags.push("Chromium-based");
  if (/; ?wv\)/.test(ua) || (os.name === "Android" && /Version\/\d/.test(ua) && /Chrome\//.test(ua))) {
    flags.push("WebView");
    evidence.push({ what: "Flag", token: /; ?wv\)/.test(ua) ? "; wv)" : "Version/x.x with Chrome on Android" });
  }
  const iOS = os.name === "iOS" || os.name === "iPadOS";
  if (iOS && /AppleWebKit/.test(ua) && !/\bSafari\//.test(ua) && !bot) {
    if (!flags.includes("WebView")) flags.push("WebView");
    evidence.push({ what: "Flag", token: "no Safari/ token on iOS (WKWebView)" });
  }
  for (const app of IN_APP) {
    if (app.re.test(ua)) {
      flags.push(`In-app browser: ${app.name}`);
      evidence.push({ what: "In-app", token: ua.match(app.re)?.[0] ?? app.name });
      break;
    }
  }
  if (/\bMobile\b/.test(ua) && device.type === "desktop") flags.push("Requests mobile site");
  if (browser.name === "Chrome" || browser.name === "Edge") {
    const chromeVer = ver(ua, /(?:Chrome|CriOS)\/([\d.]+)/);
    const [, minor = "", build = "", patch = ""] = chromeVer.split(".");
    if (Number(major(chromeVer)) >= 101 && minor === "0" && build === "0" && patch === "0" && !flags.includes("Client Hints reduced UA")) {
      flags.push("Client Hints reduced UA");
      notes.push("Chrome 101+ sends a reduced UA (x.0.0.0): the full version and platform details are only in Client Hints (Sec-CH-UA-*).");
    }
  }
  if (engine.name === "Blink" && !bot && browser.name === "Chrome" && !/Electron|HeadlessChrome/.test(ua)) {
    notes.push("Brave, Arc (on most builds) and other Chromium forks send an unmodified Chrome UA and cannot be told apart from Chrome.");
  }
  if (/Trident\/7/.test(ua) && browser.name === "Internet Explorer") notes.push("IE 11 no longer says MSIE; it is identified from Trident/7.0 and rv:11.");

  return {
    browser,
    engine,
    os: { name: os.name, version: os.version },
    device,
    isBot: bot !== null,
    flags: Array.from(new Set(flags)),
    notes: Array.from(new Set(notes)),
    evidence,
  };
}

export const UA_SAMPLES: Array<{ name: string; ua: string }> = [
  { name: "Chrome on Windows", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36" },
  { name: "Safari on iPhone", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1" },
  { name: "Firefox on Linux", ua: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0" },
  { name: "Edge on macOS", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.52" },
  { name: "Samsung Internet", ua: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36" },
  { name: "Android WebView (Instagram)", ua: "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/117.0.0.0 Mobile Safari/537.36 Instagram 300.0.0.29.110 Android" },
  { name: "Googlebot", ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  { name: "curl", ua: "curl/8.7.1" },
  { name: "Chrome Headless", ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0.6613.119 Safari/537.36" },
  { name: "Safari on iPad (legacy UA)", ua: "Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1" },
  { name: "Electron app", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Slack/4.39.95 Chrome/124.0.6367.243 Electron/30.4.0 Safari/537.36" },
  { name: "Postman", ua: "PostmanRuntime/7.42.0" },
  { name: "Firefox on iOS", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/129.0 Mobile/15E148 Safari/605.1.15" },
  { name: "Internet Explorer 11", ua: "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko" },
  { name: "Reduced Android UA", ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36" },
];

export const UA_SAMPLE = UA_SAMPLES[0].ua;
