/**
 * IP address parsing and the online geolocation lookup behind the IP
 * Location tool.
 *
 * This is the one tool that sends user input to a third party: the address
 * goes to ipwho.is (or ipinfo.io when that fails) and, for "Detect my IP",
 * the browser asks ipify for its own public address. All three are free, need
 * no key and allow browser calls. Every request is triggered by an explicit
 * click or Enter, never on page load or while typing. Reserved addresses
 * (private, loopback, link-local…) are recognised locally and never sent.
 */
import { describeSpecial, ipToString, parseIPv4 } from "@/lib/tools/ip";

// ---------- Parsing ----------

export interface ParsedIpv4 {
  family: 4;
  n: number;
  text: string;
}

export interface ParsedIpv6 {
  family: 6;
  /** Eight 16-bit groups. */
  groups: number[];
  /** Canonical RFC 5952 form. */
  text: string;
}

export type ParsedIp = ParsedIpv4 | ParsedIpv6;

export function parseIp(raw: string): { ok: true; value: ParsedIp } | { ok: false; error: string } {
  let s = raw.trim();
  if (!s) return { ok: false, error: "Enter an IPv4 or IPv6 address." };
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (s.length > 64) return { ok: false, error: "That is too long to be an IP address." };
  if (!s.includes(":")) {
    const n = parseIPv4(s);
    if (n === null) {
      if (/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(s)) return { ok: false, error: "Enter a single address without a /prefix." };
      return { ok: false, error: "Not a valid IPv4 address: expected four octets from 0 to 255." };
    }
    return { ok: true, value: { family: 4, n, text: ipToString(n) } };
  }
  const groups = parseIPv6Groups(s);
  if (!groups) return { ok: false, error: "Not a valid IPv6 address." };
  return { ok: true, value: { family: 6, groups, text: formatIPv6(groups) } };
}

/** Any textual IPv6 form (compressed, trailing dotted quad, zone id) → eight 16-bit groups. */
export function parseIPv6Groups(raw: string): number[] | null {
  let s = raw.trim().toLowerCase();
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (!/^[0-9a-f:.]+$/.test(s) || s.includes(":::")) return null;

  // Trailing dotted quad (::ffff:192.0.2.1) becomes the last two groups.
  let tailGroups: string[] = [];
  if (s.includes(".")) {
    const lastColon = s.lastIndexOf(":");
    const n = parseIPv4(s.slice(lastColon + 1));
    if (n === null) return null;
    tailGroups = [(n >>> 16).toString(16), (n & 0xffff).toString(16)];
    s = s.slice(0, lastColon + 1);
    // Keep a "::" that sits right before the quad; drop a lone separator.
    if (!s.endsWith("::")) s = s.slice(0, -1);
  }

  const parts = s.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const explicit = [...head, ...tail, ...tailGroups];
  if (explicit.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  let groups: string[];
  if (parts.length === 2) {
    if (explicit.length > 7) return null;
    groups = [...head, ...Array<string>(8 - explicit.length).fill("0"), ...tail, ...tailGroups];
  } else {
    if (explicit.length !== 8) return null;
    groups = explicit;
  }
  return groups.map((g) => parseInt(g, 16));
}

/** RFC 5952 text: lowercase hex, longest zero run compressed, IPv4-mapped shown with a dotted quad. */
export function formatIPv6(groups: number[]): string {
  const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  const text = groups.map((g) => g.toString(16));
  if (mapped) text.splice(6, 2, ipToString(((groups[6] << 16) | groups[7]) >>> 0));
  const limit = mapped ? 6 : 8;
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < limit; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < limit && groups[j] === 0) j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  if (bestLen < 2) return text.join(":");
  return `${text.slice(0, bestStart).join(":")}::${text.slice(bestStart + bestLen).join(":")}`;
}

/** Well-known IPv6 ranges that have no public location. */
export function describeSpecialIpv6(g: number[]): string | null {
  const allZero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (allZero(0, 8)) return "Unspecified address";
  if (allZero(0, 7) && g[7] === 1) return "Loopback";
  if (allZero(0, 5) && g[5] === 0xffff) {
    const v4 = describeSpecial(((g[6] << 16) | g[7]) >>> 0);
    return v4 ? `${v4} (IPv4-mapped)` : null;
  }
  const top = g[0];
  if ((top & 0xffc0) === 0xfe80) return "Link-local (fe80::/10)";
  if ((top & 0xfe00) === 0xfc00) return "Unique local (fc00::/7, RFC 4193)";
  if ((top & 0xff00) === 0xff00) return "Multicast (ff00::/8)";
  if (top === 0x2001 && g[1] === 0x0db8) return "Documentation (2001:db8::/32)";
  if (top === 0x0100 && allZero(1, 4)) return "Discard-only (100::/64)";
  return null;
}

/** Reason an address will never be geolocated, or null when it is a public address. */
export function specialLabel(ip: ParsedIp): string | null {
  return ip.family === 4 ? describeSpecial(ip.n) : describeSpecialIpv6(ip.groups);
}

// ---------- Online lookup ----------

export interface IpDetails {
  ip: string;
  version: 4 | 6;
  /** ISO 3166-1 alpha-2. */
  countryCode: string | null;
  country: string | null;
  flag: string | null;
  continent: string | null;
  region: string | null;
  regionCode: string | null;
  city: string | null;
  postal: string | null;
  latitude: number | null;
  longitude: number | null;
  /** IANA zone id, e.g. Asia/Kolkata. */
  timezone: string | null;
  /** e.g. "+05:30". */
  utcOffset: string | null;
  isp: string | null;
  org: string | null;
  /** Autonomous system number, e.g. "AS15169". */
  asn: string | null;
  domain: string | null;
  hostname: string | null;
  /** True when the address is anycast (many locations at once), so the city is meaningless. */
  anycast: boolean;
  capital: string | null;
  callingCode: string | null;
  isEu: boolean | null;
  /** Which service answered. */
  source: "ipwho.is" | "ipinfo.io";
}

export const LOOKUP_HOSTS = {
  primary: "https://ipwho.is",
  fallback: "https://ipinfo.io",
  detectV4: "https://api.ipify.org",
  detectV6: "https://api64.ipify.org",
} as const;

const TIMEOUT_MS = 10_000;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function flagEmoji(code: string | null): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** "+05:30" from a seconds offset. */
export function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Current UTC offset of an IANA zone, computed locally; null when the zone is unknown to this browser. */
export function zoneOffset(zone: string, at = new Date()): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (name === "GMT") return "+00:00";
    const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(name);
    if (!m) return null;
    const sign = m[1].startsWith("-") ? "-" : "+";
    return `${sign}${m[1].slice(1).padStart(2, "0")}:${m[2] ?? "00"}`;
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;

export function normalizeIpwhois(j: Json): IpDetails {
  const conn = (j.connection ?? {}) as Json;
  const tz = (j.timezone ?? {}) as Json;
  const flag = (j.flag ?? {}) as Json;
  const ip = str(j.ip) ?? "";
  const asn = num(conn.asn);
  const offset = num(tz.offset);
  return {
    ip,
    version: ip.includes(":") ? 6 : 4,
    countryCode: str(j.country_code),
    country: str(j.country),
    flag: str(flag.emoji) ?? flagEmoji(str(j.country_code)),
    continent: str(j.continent),
    region: str(j.region),
    regionCode: str(j.region_code),
    city: str(j.city),
    postal: str(j.postal),
    latitude: num(j.latitude),
    longitude: num(j.longitude),
    timezone: str(tz.id),
    utcOffset: str(tz.utc) ?? (offset === null ? null : formatOffset(offset)),
    isp: str(conn.isp),
    org: str(conn.org),
    asn: asn === null ? null : `AS${asn}`,
    domain: str(conn.domain),
    hostname: null,
    anycast: false,
    capital: str(j.capital),
    callingCode: str(j.calling_code) ? `+${str(j.calling_code)}` : null,
    isEu: typeof j.is_eu === "boolean" ? j.is_eu : null,
    source: "ipwho.is",
  };
}

export function normalizeIpinfo(j: Json): IpDetails {
  const ip = str(j.ip) ?? "";
  const loc = str(j.loc)?.split(",").map(Number) ?? [];
  const org = str(j.org);
  const m = org ? /^(AS\d+)\s*(.*)$/.exec(org) : null;
  const timezone = str(j.timezone);
  return {
    ip,
    version: ip.includes(":") ? 6 : 4,
    countryCode: str(j.country),
    country: str(j.country) ? countryName(str(j.country)!) : null,
    flag: flagEmoji(str(j.country)),
    continent: null,
    region: str(j.region),
    regionCode: null,
    city: str(j.city),
    postal: str(j.postal),
    latitude: loc.length === 2 && Number.isFinite(loc[0]) ? loc[0] : null,
    longitude: loc.length === 2 && Number.isFinite(loc[1]) ? loc[1] : null,
    timezone,
    utcOffset: timezone ? zoneOffset(timezone) : null,
    isp: m ? m[2] || null : org,
    org: m ? m[2] || null : org,
    asn: m ? m[1] : null,
    domain: null,
    hostname: str(j.hostname),
    anycast: j.anycast === true,
    capital: null,
    callingCode: null,
    isEu: null,
    source: "ipinfo.io",
  };
}

let displayNames: Intl.DisplayNames | null | undefined;
export function countryName(code: string): string {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
    } catch {
      displayNames = null;
    }
  }
  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<Json> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
  if (res.status === 429) throw new Error("rate limit reached, try again in a minute");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!body || typeof body !== "object") throw new Error("unexpected response");
  return body as Json;
}

export class LookupError extends Error {
  constructor(
    message: string,
    /** Per-service failure reasons, for the UI. */
    public readonly attempts: Array<{ service: string; reason: string }>,
  ) {
    super(message);
  }
}

const reason = (e: unknown) => (e instanceof Error ? (e.name === "TimeoutError" ? "timed out" : e.message) : String(e));

/**
 * Looks an address up on ipwho.is, then ipinfo.io if that fails or has no data.
 * The caller must already have rejected reserved addresses with `specialLabel`.
 */
export async function lookupIp(address: string, fetchImpl: typeof fetch = fetch): Promise<IpDetails> {
  const attempts: Array<{ service: string; reason: string }> = [];
  try {
    const j = await getJson(`${LOOKUP_HOSTS.primary}/${encodeURIComponent(address)}`, fetchImpl);
    if (j.success === false) throw new Error(str(j.message) ?? "no data for this address");
    return normalizeIpwhois(j);
  } catch (e) {
    attempts.push({ service: "ipwho.is", reason: reason(e) });
  }
  try {
    const j = await getJson(`${LOOKUP_HOSTS.fallback}/${encodeURIComponent(address)}/json`, fetchImpl);
    if (j.bogon === true) throw new Error("reserved address");
    if (typeof j.error === "object" && j.error) throw new Error(str((j.error as Json).message) ?? "error");
    return normalizeIpinfo(j);
  } catch (e) {
    attempts.push({ service: "ipinfo.io", reason: reason(e) });
  }
  throw new LookupError("Both lookup services failed.", attempts);
}

export interface PublicIps {
  ipv4: string | null;
  ipv6: string | null;
}

/** The browser's own public addresses via ipify; either may be null when that family is unavailable. */
export async function detectPublicIp(fetchImpl: typeof fetch = fetch): Promise<PublicIps> {
  const [v4, v6] = await Promise.allSettled([
    getJson(`${LOOKUP_HOSTS.detectV4}?format=json`, fetchImpl),
    getJson(`${LOOKUP_HOSTS.detectV6}?format=json`, fetchImpl),
  ]);
  const pick = (r: PromiseSettledResult<Json>, family: 4 | 6): string | null => {
    if (r.status !== "fulfilled") return null;
    const ip = str(r.value.ip);
    if (!ip) return null;
    const parsed = parseIp(ip);
    return parsed.ok && parsed.value.family === family ? parsed.value.text : null;
  };
  const ipv4 = pick(v4, 4);
  // api64 returns whichever family the network prefers; only keep it if it is really IPv6.
  const ipv6 = pick(v6, 6);
  if (!ipv4 && !ipv6) {
    const why = [v4, v6].map((r) => (r.status === "rejected" ? reason(r.reason) : "no address")).join(" / ");
    throw new Error(`Could not reach ipify (${why}).`);
  }
  return { ipv4, ipv6 };
}

/** OpenStreetMap link for coordinates; opened by the user, never fetched. */
export function mapLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=10/${lat}/${lng}`;
}
