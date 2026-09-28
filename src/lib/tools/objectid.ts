import { formatISO, formatLocal, formatUTC } from "@/lib/tools/time";

export interface ObjectIdDecoded {
  valid: true;
  id: string;
  timestampHex: string;
  randomHex: string;
  counterHex: string;
  unixSeconds: number;
  date: Date;
  local: string;
  utc: string;
  iso: string;
}

export interface ObjectIdInvalid {
  valid: false;
  error: string;
}

export function validateObjectId(raw: string): string | null {
  const id = raw.trim();
  if (!id) return "Enter an ObjectId.";
  if (id.length !== 24) return `ObjectId must be exactly 24 characters (got ${id.length}).`;
  if (!/^[0-9a-fA-F]+$/.test(id)) return "ObjectId must contain only hexadecimal characters (0-9, a-f).";
  return null;
}

export function decodeObjectId(raw: string): ObjectIdDecoded | ObjectIdInvalid {
  const error = validateObjectId(raw);
  if (error) return { valid: false, error };
  const id = raw.trim().toLowerCase();
  const timestampHex = id.slice(0, 8);
  const randomHex = id.slice(8, 18);
  const counterHex = id.slice(18, 24);
  const unixSeconds = parseInt(timestampHex, 16);
  const date = new Date(unixSeconds * 1000);
  return {
    valid: true,
    id,
    timestampHex,
    randomHex,
    counterHex,
    unixSeconds,
    date,
    local: formatLocal(date),
    utc: formatUTC(date),
    iso: formatISO(date),
  };
}

// Per-session random 5-byte process identifier and a 3-byte counter, like real drivers.
let processRandom: string | null = null;
let counter = Math.floor(Math.random() * 0xffffff);

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a MongoDB-style ObjectId locally: 4-byte timestamp, 5-byte random, 3-byte counter. */
export function generateObjectId(date: Date = new Date()): string {
  if (!processRandom) processRandom = randomHex(5);
  const ts = Math.floor(date.getTime() / 1000).toString(16).padStart(8, "0");
  counter = (counter + 1) % 0x1000000;
  const c = counter.toString(16).padStart(6, "0");
  return `${ts}${processRandom}${c}`;
}
