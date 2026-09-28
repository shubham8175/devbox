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
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateUuids(count: number): string[] {
  return Array.from({ length: count }, generateUuidV4);
}

export interface UuidInfo {
  valid: boolean;
  normalized?: string;
  version?: number | null;
  variant?: string;
  error?: string;
}

const NIL = "00000000-0000-0000-0000-000000000000";
const MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export function inspectUuid(raw: string): UuidInfo {
  const value = raw.trim();
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
  return { valid: true, normalized, version: version >= 1 && version <= 8 ? version : null, variant };
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
