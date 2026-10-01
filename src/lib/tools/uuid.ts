import { formatISO, formatLocal, formatUTC } from "@/lib/tools/time";
import { MAX_COMPARE_ENTRIES, type ParsedValue } from "@/lib/tools/time-compare";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateUuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback using getRandomValues (RFC 4122 v4)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return hyphenate(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
}

/** RFC 9562 v7: 48-bit Unix ms timestamp, then version/variant bits around 74 random bits. */
export function generateUuidV7(date: Date = new Date()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const ms = date.getTime();
  for (let i = 0; i < 6; i++) bytes[i] = Math.floor(ms / 2 ** (8 * (5 - i))) % 256;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return hyphenate(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
}

export type GeneratedVersion = 4 | 7;

export function generateUuids(count: number, version: GeneratedVersion = 4): string[] {
  return Array.from({ length: count }, () => (version === 7 ? generateUuidV7() : generateUuidV4()));
}

/**
 * Strips the wrappers UUIDs are commonly copied with: quotes, braces (Microsoft GUIDs)
 * and the urn:uuid: prefix. A bare 32-hex-digit value gets its hyphens back.
 */
export function unwrapUuid(raw: string): string {
  const value = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^urn:uuid:/i, "")
    .replace(/^\{([^{}]*)\}$/, "$1")
    .trim();
  return /^[0-9a-f]{32}$/i.test(value) ? hyphenate(value) : value;
}

/** 32 hex digits → 8-4-4-4-12. */
function hyphenate(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface UuidTimestamp {
  date: Date;
  unixMs: number;
  local: string;
  utc: string;
  iso: string;
  /** What the raw timestamp field holds, e.g. "48-bit Unix milliseconds". */
  source: string;
}

/** 100 ns intervals between the Gregorian epoch (1582-10-15) and the Unix epoch. */
const GREGORIAN_OFFSET = BigInt("122192928000000000");

/** Versions whose bits carry a creation time. */
export const TIMESTAMP_VERSIONS = [1, 6, 7];

/**
 * Reads the embedded time from a normalized (lowercase, hyphenated) RFC 9562 UUID.
 * v7: the first 48 bits are Unix ms. v1/v6: a 60-bit count of 100 ns ticks since 1582-10-15,
 * stored as time_low-time_mid-time_hi in v1 and most-significant-first in v6.
 */
export function decodeUuidTimestamp(normalized: string, version: number): UuidTimestamp | null {
  const hex = normalized.replace(/-/g, "");
  let unixMs: number;
  let source: string;
  if (version === 7) {
    unixMs = parseInt(hex.slice(0, 12), 16);
    source = "48-bit Unix milliseconds";
  } else if (version === 1 || version === 6) {
    // hex[12] is the version nibble; the 12 bits after it are the last timestamp piece.
    const ticksHex =
      version === 1 ? hex.slice(13, 16) + hex.slice(8, 12) + hex.slice(0, 8) : hex.slice(0, 12) + hex.slice(13, 16);
    unixMs = Number((BigInt(`0x${ticksHex}`) - GREGORIAN_OFFSET) / BigInt(10000));
    source = "60-bit count of 100 ns since 1582-10-15";
  } else {
    return null;
  }
  const date = new Date(unixMs);
  return { date, unixMs, local: formatLocal(date), utc: formatUTC(date), iso: formatISO(date), source };
}

export const UUID_COMPARE_SAMPLE = [
  "018bcfe5-6800-7a1c-9f3e-5b2d4c6e8a01",
  "urn:uuid:018bcfeb-d0a0-7b42-8d17-3e9a6f0c2b54",
  "{018BD059-ADA0-7C3D-A5E8-71F2B4D9C0E6}",
];

/** Compare-field parser: any wrapped UUID that carries a timestamp (v1, v6, v7). */
export function parseUuidValue(raw: string): ParsedValue {
  const info = inspectUuid(raw);
  if (!info.valid) return { date: null, error: info.error ?? "Invalid UUID." };
  if (info.timestamp) return { date: info.timestamp.date };
  const what = info.version ? `UUID v${info.version}` : `The ${info.variant ?? "UUID"}`;
  if (info.version && TIMESTAMP_VERSIONS.includes(info.version)) {
    return { date: null, error: `${what} has a non-RFC 9562 variant (${info.variant}), so its timestamp can't be read.` };
  }
  return { date: null, error: `${what} has no timestamp — only v1, v6 and v7 can be compared.` };
}

/** Pasting several UUIDs into one field: separated by newlines, commas or spaces, wrappers stripped. */
export function splitUuidPaste(raw: string): string[] {
  return raw
    .replace(/urn:uuid:/gi, " ")
    .replace(/["'`{}[\]()]/g, " ")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(unwrapUuid)
    .slice(0, MAX_COMPARE_ENTRIES);
}

export interface UuidInfo {
  valid: boolean;
  normalized?: string;
  version?: number | null;
  variant?: string;
  /** Present for v1, v6 and v7 UUIDs with the RFC 9562 variant. */
  timestamp?: UuidTimestamp | null;
  error?: string;
}

const NIL = "00000000-0000-0000-0000-000000000000";
const MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export function inspectUuid(raw: string): UuidInfo {
  const value = unwrapUuid(raw);
  if (!value) return { valid: false, error: "Enter a UUID to validate." };
  if (!UUID_RE.test(value)) {
    return {
      valid: false,
      error: "Not a valid UUID. Expected 8-4-4-4-12 hexadecimal groups, e.g. 123e4567-e89b-12d3-a456-426614174000.",
    };
  }
  const normalized = value.toLowerCase();
  if (normalized === NIL) return { valid: true, normalized, version: null, variant: "Nil UUID" };
  if (normalized === MAX) return { valid: true, normalized, version: null, variant: "Max UUID" };
  const version = parseInt(normalized[14], 16);
  const variantNibble = parseInt(normalized[19], 16);
  let variant = "Unknown";
  if ((variantNibble & 0x8) === 0) variant = "NCS (reserved)";
  else if ((variantNibble & 0xc) === 0x8) variant = "RFC 4122 / RFC 9562";
  else if ((variantNibble & 0xe) === 0xc) variant = "Microsoft (reserved)";
  else variant = "Future (reserved)";
  const rfc = (variantNibble & 0xc) === 0x8;
  return {
    valid: true,
    normalized,
    version: version >= 1 && version <= 8 ? version : null,
    variant,
    // Version bits only mean something under the RFC variant.
    timestamp: rfc ? decodeUuidTimestamp(normalized, version) : null,
  };
}

export const UUID_VERSION_LABELS: Record<number, string> = {
  1: "Time-based (MAC + timestamp)",
  2: "DCE Security",
  3: "Name-based (MD5)",
  4: "Random",
  5: "Name-based (SHA-1)",
  6: "Reordered time-based",
  7: "Unix timestamp-based",
  8: "Custom / vendor-specific",
};
