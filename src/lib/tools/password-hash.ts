/**
 * Minimal surface of `bcryptjs` used here. The UI lazy-loads the real module on
 * the route and passes it in, so this file stays free of the heavy import and
 * tests can hand in the real implementation.
 */
export interface BcryptModule {
  hash(s: string, rounds: number): Promise<string>;
  compare(s: string, hash: string): Promise<boolean>;
  getRounds(hash: string): number;
}

export const BCRYPT_MIN_COST = 4;
export const BCRYPT_MAX_COST = 15;
export const BCRYPT_DEFAULT_COST = 10;
/** Above this cost bcrypt in JavaScript takes multiple seconds per hash. */
export const BCRYPT_SLOW_COST = 12;
/** bcrypt only feeds the first 72 bytes of the password into the key schedule. */
export const BCRYPT_MAX_PASSWORD_BYTES = 72;
export const MAX_PASSWORD_CHARS = 4096;

export const PBKDF2_HASHES = ["SHA-256", "SHA-512"] as const;
export type Pbkdf2Hash = (typeof PBKDF2_HASHES)[number];
export const PBKDF2_DEFAULT_ITERATIONS = 600_000;
export const PBKDF2_MAX_ITERATIONS = 5_000_000;

export const PASSWORD_HASH_SAMPLE = { password: "correct horse battery staple" } as const;

export type BcryptVersion = "2a" | "2b" | "2y";
export type BcryptHashResult = { ok: true; hash: string; cost: number; version: BcryptVersion; salt: string; hashPart: string } | { ok: false; error: string };
export type BcryptVerifyResult = { ok: true; match: boolean; cost: number; version: BcryptVersion } | { ok: false; error: string };
export type BcryptInspectResult = { ok: true; version: BcryptVersion; cost: number; salt: string; hashPart: string } | { ok: false; error: string };

export interface Pbkdf2Options {
  password: string;
  iterations?: number;
  hash?: Pbkdf2Hash;
  saltBytes?: number;
  keyLength?: number;
  /** Fixed salt, mainly for tests. Random when omitted. */
  salt?: Uint8Array;
}
export type Pbkdf2HashResult =
  | { ok: true; hex: string; base64: string; saltHex: string; saltBase64: string; phc: string; iterations: number; hash: Pbkdf2Hash; keyLength: number }
  | { ok: false; error: string };
export type Pbkdf2VerifyResult = { ok: true; match: boolean; iterations: number; hash: Pbkdf2Hash; keyLength: number } | { ok: false; error: string };

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** True when bcrypt would silently ignore part of the password. */
export function bcryptTruncationWarning(password: string): boolean {
  return utf8Length(password) > BCRYPT_MAX_PASSWORD_BYTES;
}

function checkPassword(password: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length > MAX_PASSWORD_CHARS) return `Passwords are limited to ${MAX_PASSWORD_CHARS} characters here.`;
  return null;
}

const BCRYPT_RE = /^\$(2a|2b|2y)\$(\d{2})\$([./A-Za-z0-9]{22})([./A-Za-z0-9]{31})$/;

/** Split a bcrypt string into version, cost, 22-char salt and 31-char hash. */
export function inspectBcryptHash(hash: string): BcryptInspectResult {
  const m = BCRYPT_RE.exec(hash.trim());
  if (!m) {
    if (/^\$2x\$/.test(hash.trim())) return { ok: false, error: "$2x$ hashes come from a buggy 2011 crypt_blowfish build and are not supported." };
    return { ok: false, error: "Not a bcrypt hash. Expected $2a$, $2b$ or $2y$, a two-digit cost and 53 characters of salt + hash, e.g. $2b$10$…" };
  }
  return { ok: true, version: m[1] as BcryptVersion, cost: Number(m[2]), salt: m[3], hashPart: m[4] };
}

export async function bcryptHash(mod: BcryptModule, password: string, cost: number = BCRYPT_DEFAULT_COST): Promise<BcryptHashResult> {
  const bad = checkPassword(password);
  if (bad) return { ok: false, error: bad };
  if (!Number.isInteger(cost) || cost < BCRYPT_MIN_COST || cost > BCRYPT_MAX_COST) return { ok: false, error: `Cost must be a whole number between ${BCRYPT_MIN_COST} and ${BCRYPT_MAX_COST}.` };
  try {
    const hash = await mod.hash(password, cost);
    const parts = inspectBcryptHash(hash);
    if (!parts.ok) return { ok: false, error: "bcrypt returned an unexpected hash format." };
    return { ok: true, hash, version: parts.version, cost: parts.cost, salt: parts.salt, hashPart: parts.hashPart };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "bcrypt failed." };
  }
}

export async function bcryptVerify(mod: BcryptModule, password: string, hash: string): Promise<BcryptVerifyResult> {
  if (!password) return { ok: false, error: "Enter the password to check." };
  if (password.length > MAX_PASSWORD_CHARS) return { ok: false, error: `Passwords are limited to ${MAX_PASSWORD_CHARS} characters here.` };
  const parts = inspectBcryptHash(hash);
  if (!parts.ok) return parts;
  try {
    // bcryptjs compares in constant time internally.
    const match = await mod.compare(password, hash.trim());
    return { ok: true, match, cost: parts.cost, version: parts.version };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "bcrypt failed." };
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array | null {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*=*$/.test(b64)) return null;
  try {
    return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** PHC strings use unpadded standard Base64. */
function toB64(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/=+$/, "");
}

function phcId(hash: Pbkdf2Hash): string {
  return `pbkdf2-${hash.toLowerCase().replace("-", "")}`;
}

async function derive(password: string, salt: Uint8Array, iterations: number, hash: Pbkdf2Hash, keyLength: number): Promise<Uint8Array> {
  // The password is only imported as a non-extractable key for this derivation; nothing is retained.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  // Copy the salt into a fresh ArrayBuffer so any Uint8Array view satisfies BufferSource.
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new Uint8Array(salt), iterations, hash }, key, keyLength * 8));
}

function checkPbkdf2Params(iterations: number, hash: string, keyLength: number): string | null {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_MAX_ITERATIONS) return `Iterations must be a whole number between 1 and ${PBKDF2_MAX_ITERATIONS.toLocaleString()}.`;
  if (!(PBKDF2_HASHES as readonly string[]).includes(hash)) return "Hash must be SHA-256 or SHA-512.";
  if (!Number.isInteger(keyLength) || keyLength < 16 || keyLength > 64) return "Key length must be between 16 and 64 bytes.";
  return null;
}

export async function pbkdf2Hash(opts: Pbkdf2Options): Promise<Pbkdf2HashResult> {
  const bad = checkPassword(opts.password);
  if (bad) return { ok: false, error: bad };
  const iterations = opts.iterations ?? PBKDF2_DEFAULT_ITERATIONS;
  const hash = opts.hash ?? "SHA-256";
  const keyLength = opts.keyLength ?? 32;
  const paramError = checkPbkdf2Params(iterations, hash, keyLength);
  if (paramError) return { ok: false, error: paramError };
  const saltBytes = opts.saltBytes ?? 16;
  if (!Number.isInteger(saltBytes) || saltBytes < 8 || saltBytes > 64) return { ok: false, error: "Salt must be between 8 and 64 bytes." };
  let salt = opts.salt;
  if (!salt) {
    salt = new Uint8Array(saltBytes);
    crypto.getRandomValues(salt);
  }
  try {
    const dk = await derive(opts.password, salt, iterations, hash, keyLength);
    return {
      ok: true,
      hex: toHex(dk),
      base64: toBase64(dk),
      saltHex: toHex(salt),
      saltBase64: toBase64(salt),
      phc: `$${phcId(hash)}$i=${iterations}$${toB64(salt)}$${toB64(dk)}`,
      iterations,
      hash,
      keyLength,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "PBKDF2 failed." };
  }
}

export type ParsedPhc = { ok: true; hash: Pbkdf2Hash; iterations: number; salt: Uint8Array; key: Uint8Array } | { ok: false; error: string };

/** Parse `$pbkdf2-sha256$i=600000$<salt>$<hash>` (PHC string format; padded or unpadded Base64). */
export function parsePbkdf2Phc(text: string): ParsedPhc {
  const m = /^\$pbkdf2-(sha256|sha512)\$i=(\d{1,8})\$([A-Za-z0-9+/=_-]+)\$([A-Za-z0-9+/=_-]+)$/.exec(text.trim());
  if (!m) return { ok: false, error: "Not a PBKDF2 PHC string. Expected $pbkdf2-sha256$i=<iterations>$<salt>$<hash>." };
  const hash: Pbkdf2Hash = m[1] === "sha256" ? "SHA-256" : "SHA-512";
  const iterations = Number(m[2]);
  const salt = fromBase64(m[3]);
  const key = fromBase64(m[4]);
  if (!salt || !key) return { ok: false, error: "The salt or hash part is not valid Base64." };
  const paramError = checkPbkdf2Params(iterations, hash, key.length);
  if (paramError) return { ok: false, error: paramError };
  if (salt.length < 8) return { ok: false, error: "Salt must be at least 8 bytes." };
  return { ok: true, hash, iterations, salt, key };
}

/** Compare without short-circuiting so timing does not reveal the first differing byte. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function pbkdf2Verify(password: string, phc: string): Promise<Pbkdf2VerifyResult> {
  if (!password) return { ok: false, error: "Enter the password to check." };
  if (password.length > MAX_PASSWORD_CHARS) return { ok: false, error: `Passwords are limited to ${MAX_PASSWORD_CHARS} characters here.` };
  const parsed = parsePbkdf2Phc(phc);
  if (!parsed.ok) return parsed;
  try {
    const dk = await derive(password, parsed.salt, parsed.iterations, parsed.hash, parsed.key.length);
    return { ok: true, match: constantTimeEqual(dk, parsed.key), iterations: parsed.iterations, hash: parsed.hash, keyLength: parsed.key.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "PBKDF2 failed." };
  }
}

/** Which of the two formats a pasted hash is, so Verify mode can pick the right checker. */
export function detectHashKind(hash: string): "bcrypt" | "pbkdf2" | null {
  const t = hash.trim();
  if (t.startsWith("$pbkdf2-")) return "pbkdf2";
  if (/^\$2[aby]\$/.test(t)) return "bcrypt";
  return null;
}
