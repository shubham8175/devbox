import { formatISO, formatLocal, isValidDate, relativeTime } from "@/lib/tools/time";

export type CookieMode = "request" | "set-cookie";

export interface RequestCookie {
  name: string;
  value: string;
  decoded: string;
}

export interface SetCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: { raw: string; date: Date | null; local: string; iso: string; relative: string };
  maxAge?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  partitioned: boolean;
  priority?: string;
  unknown: Array<{ name: string; value?: string }>;
  warnings: string[];
  raw: string;
}

export function detectCookieMode(input: string): CookieMode {
  const first = input.trim().split(/\r?\n/)[0] ?? "";
  if (/^set-cookie\s*:/i.test(first)) return "set-cookie";
  if (/^cookie\s*:/i.test(first)) return "request";
  return /;\s*(expires|max-age|path|domain|secure|httponly|samesite)\b/i.test(input) ? "set-cookie" : "request";
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function parseRequestCookies(input: string): RequestCookie[] {
  const body = input.replace(/^\s*cookie\s*:/i, "").trim();
  if (!body) return [];
  return body
    .split(/;\s*/)
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      const name = eq >= 0 ? pair.slice(0, eq).trim() : pair;
      const value = eq >= 0 ? pair.slice(eq + 1).trim() : "";
      return { name, value, decoded: safeDecode(value) };
    });
}

export function parseSetCookie(line: string, now: Date = new Date()): SetCookie {
  const raw = line.replace(/^\s*set-cookie\s*:/i, "").trim();
  const parts = raw.split(";").map((p) => p.trim());
  const first = parts.shift() ?? "";
  const eq = first.indexOf("=");
  const cookie: SetCookie = {
    name: eq >= 0 ? first.slice(0, eq).trim() : first,
    value: eq >= 0 ? first.slice(eq + 1).trim() : "",
    secure: false,
    httpOnly: false,
    partitioned: false,
    unknown: [],
    warnings: [],
    raw,
  };
  for (const part of parts) {
    if (!part) continue;
    const i = part.indexOf("=");
    const attr = (i >= 0 ? part.slice(0, i) : part).trim().toLowerCase();
    const val = i >= 0 ? part.slice(i + 1).trim() : undefined;
    switch (attr) {
      case "domain":
        cookie.domain = val;
        break;
      case "path":
        cookie.path = val;
        break;
      case "expires": {
        const d = val ? new Date(val) : null;
        const ok = d !== null && isValidDate(d);
        cookie.expires = { raw: val ?? "", date: ok ? d : null, local: ok ? formatLocal(d) : "Invalid date", iso: ok ? formatISO(d) : "", relative: ok ? relativeTime(d, now) : "" };
        if (!ok) cookie.warnings.push("Expires is not a valid date.");
        else if (d.getTime() < now.getTime()) cookie.warnings.push("Expires is in the past — this deletes the cookie.");
        break;
      }
      case "max-age": {
        const n = Number(val);
        if (!Number.isFinite(n)) cookie.warnings.push("Max-Age is not a number.");
        else cookie.maxAge = n;
        if (Number.isFinite(n) && n <= 0) cookie.warnings.push("Max-Age ≤ 0 deletes the cookie immediately.");
        break;
      }
      case "secure":
        cookie.secure = true;
        break;
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "samesite":
        cookie.sameSite = val ? val[0].toUpperCase() + val.slice(1).toLowerCase() : "";
        break;
      case "partitioned":
        cookie.partitioned = true;
        break;
      case "priority":
        cookie.priority = val;
        break;
      default:
        cookie.unknown.push({ name: attr, value: val });
    }
  }
  if (!cookie.name) cookie.warnings.push("Cookie has no name.");
  if (cookie.sameSite === "None" && !cookie.secure) cookie.warnings.push("SameSite=None requires the Secure attribute; browsers will reject this cookie.");
  if (cookie.partitioned && !cookie.secure) cookie.warnings.push("Partitioned cookies must also be Secure.");
  if (cookie.name.startsWith("__Secure-") && !cookie.secure) cookie.warnings.push("__Secure- prefix requires Secure.");
  if (cookie.name.startsWith("__Host-") && (!cookie.secure || cookie.domain || (cookie.path ?? "/") !== "/")) cookie.warnings.push("__Host- prefix requires Secure, no Domain and Path=/.");
  if (cookie.expires && cookie.maxAge !== undefined) cookie.warnings.push("Both Expires and Max-Age set; Max-Age takes precedence.");
  if (!cookie.expires && cookie.maxAge === undefined) cookie.warnings.push("No Expires/Max-Age: this is a session cookie.");
  if (cookie.sameSite === undefined) cookie.warnings.push("No SameSite: modern browsers default to Lax.");
  return cookie;
}

export function parseSetCookies(input: string, now: Date = new Date()): SetCookie[] {
  return input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => parseSetCookie(l, now));
}

export function buildCookieHeader(pairs: Array<{ name: string; value: string }>, encode: boolean): string {
  return pairs
    .filter((p) => p.name.trim())
    .map((p) => `${p.name.trim()}=${encode ? encodeURIComponent(p.value) : p.value}`)
    .join("; ");
}

export const COOKIE_SAMPLE_REQUEST = "Cookie: session=abc123; theme=dark; _ga=GA1.2.123456789.1700000000";
export const COOKIE_SAMPLE_SET = `Set-Cookie: session=abc123; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400
Set-Cookie: theme=dark; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT
Set-Cookie: tracker=1; Domain=.example.com; SameSite=None`;
