export type QrMode = "text" | "url" | "wifi" | "email" | "phone" | "sms";
export type QrErrorLevel = "L" | "M" | "Q" | "H";

export const QR_MODES: Array<{ id: QrMode; label: string }> = [
  { id: "text", label: "Text" },
  { id: "url", label: "URL" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "sms", label: "SMS" },
];

export const QR_ERROR_LEVELS: Array<{ id: QrErrorLevel; label: string; hint: string }> = [
  { id: "L", label: "L", hint: "~7% recovery" },
  { id: "M", label: "M", hint: "~15% recovery" },
  { id: "Q", label: "Q", hint: "~25% recovery" },
  { id: "H", label: "H", hint: "~30% recovery" },
];

export interface WifiFields {
  ssid: string;
  password: string;
  security: "WPA" | "WEP" | "nopass";
  hidden: boolean;
}

export interface EmailFields {
  to: string;
  subject: string;
  body: string;
}

export interface SmsFields {
  number: string;
  message: string;
}

/** Escape special characters in Wi-Fi QR payload fields. */
function wifiEscape(s: string): string {
  return s.replace(/([\;,":])/g, "\\$1");
}

export function buildWifiPayload(f: WifiFields): string {
  const parts = [`T:${f.security}`, `S:${wifiEscape(f.ssid)}`];
  if (f.security !== "nopass" && f.password) parts.push(`P:${wifiEscape(f.password)}`);
  if (f.hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

export function buildEmailPayload(f: EmailFields): string {
  const params = new URLSearchParams();
  if (f.subject) params.set("subject", f.subject);
  if (f.body) params.set("body", f.body);
  const qs = params.toString().replace(/\+/g, "%20");
  return `mailto:${f.to}${qs ? `?${qs}` : ""}`;
}

export function buildPhonePayload(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, "")}`;
}

export function buildSmsPayload(f: SmsFields): string {
  return `SMSTO:${f.number.replace(/[^\d+]/g, "")}:${f.message}`;
}

export function normalizeUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
}

/** Schemes the reader may turn into a clickable "open" action. Everything else is copy-only. */
function safeHttpHref(t: string): string | undefined {
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function safeMailtoHref(t: string): string | undefined {
  // Rebuild from a parsed address so only a plain mailto: with one recipient is offered.
  const m = /^mailto:([^?\s]+)/i.exec(t);
  if (!m) return undefined;
  let to: string;
  try {
    to = decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
  return /^[^\s@<>"]+@[^\s@<>"]+$/.test(to) ? `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}` : undefined;
}

function safeTelHref(t: string): string | undefined {
  const digits = t.slice(4).replace(/[^\d+]/g, "");
  return /^\+?\d{3,20}$/.test(digits) ? `tel:${digits}` : undefined;
}

/**
 * Classify decoded QR content so the reader can offer sensible actions.
 * QR payloads are untrusted: only http(s), a well-formed mailto: and tel: ever get an href.
 * Custom schemes (javascript:, data:, file:, intent:, app links, …) are shown as text and can be copied only.
 */
export function classifyPayload(text: string): { kind: "url" | "wifi" | "email" | "phone" | "sms" | "text"; label: string; href?: string } {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return { kind: "url", label: "URL", href: safeHttpHref(t) };
  if (/^WIFI:/i.test(t)) return { kind: "wifi", label: "Wi-Fi network" };
  if (/^mailto:/i.test(t)) return { kind: "email", label: "Email", href: safeMailtoHref(t) };
  if (/^tel:/i.test(t)) return { kind: "phone", label: "Phone number", href: safeTelHref(t) };
  if (/^smsto?:/i.test(t)) return { kind: "sms", label: "SMS" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return { kind: "text", label: "Custom scheme (copy only)" };
  return { kind: "text", label: "Text" };
}

export function parseWifiPayload(text: string): Partial<WifiFields> | null {
  if (!/^WIFI:/i.test(text)) return null;
  const out: Partial<WifiFields> = {};
  const body = text.slice(5);
  const re = /([A-Z]):((?:\\.|[^;])*);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const val = m[2].replace(/\\(.)/g, "$1");
    if (m[1] === "S") out.ssid = val;
    if (m[1] === "P") out.password = val;
    if (m[1] === "T") out.security = (val.toUpperCase() as WifiFields["security"]) || "nopass";
    if (m[1] === "H") out.hidden = val === "true";
  }
  return out;
}
