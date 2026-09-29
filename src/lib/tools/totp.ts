export const OTP_ALGORITHMS = ["SHA1", "SHA256", "SHA512"] as const;
export type OtpAlgorithm = (typeof OTP_ALGORITHMS)[number];
export const OTP_DIGITS = [6, 7, 8] as const;
export type OtpDigits = (typeof OTP_DIGITS)[number];
export type OtpType = "totp" | "hotp";

/** Base32 secrets longer than this are rejected before decoding; real secrets are 16–64 characters. */
export const MAX_SECRET_CHARS = 1024;
export const MAX_URI_CHARS = 4096;
export const MAX_PERIOD_SECONDS = 3600;

const WEBCRYPTO_HASH: Record<OtpAlgorithm, "SHA-1" | "SHA-256" | "SHA-512"> = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" };
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_SAMPLE = { secret: "JBSWY3DPEHPK3PXP", issuer: "DevBox", account: "ada@example.com" } as const;

export interface OtpConfig {
  type: OtpType;
  label: string;
  issuer: string;
  account: string;
  secret: string;
  algorithm: OtpAlgorithm;
  digits: OtpDigits;
  period: number;
  counter: number;
}

export type Base32DecodeResult = { ok: true; bytes: Uint8Array } | { ok: false; error: string };
export type ParseOtpauthResult = { ok: true; config: OtpConfig } | { ok: false; error: string };
export type TotpResult = { ok: true; code: string; remainingSeconds: number; counter: number } | { ok: false; error: string };

/** RFC 4648 Base32 decode. Case-insensitive; spaces, dashes and `=` padding are ignored. */
export function base32Decode(input: string): Base32DecodeResult {
  if (input.length > MAX_SECRET_CHARS) return { ok: false, error: `Secret is limited to ${MAX_SECRET_CHARS} characters.` };
  const clean = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!clean) return { ok: false, error: "Enter a Base32 secret." };
  const bad = /[^A-Z2-7]/.exec(clean);
  if (bad) return { ok: false, error: `"${bad[0]}" is not a Base32 character (A–Z and 2–7 only). Note that 0, 1, 8 and 9 never appear.` };
  const out = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const ch of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  if (out.length === 0) return { ok: false, error: "Secret is too short to hold a single byte." };
  return { ok: true, bytes: out };
}

/** RFC 4648 Base32 encode without padding, as authenticator apps expect. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Cryptographically random secret, encoded for pasting into an authenticator. Must run in the browser (or node ≥ 19). */
export function randomBase32Secret(bytes = 20): string {
  const buf = new Uint8Array(Math.min(Math.max(bytes, 10), 64));
  crypto.getRandomValues(buf);
  return base32Encode(buf);
}

export function normalizeAlgorithm(raw: string | null | undefined): OtpAlgorithm | null {
  if (!raw) return "SHA1";
  const a = raw.toUpperCase().replace("-", "");
  return (OTP_ALGORITHMS as readonly string[]).includes(a) ? (a as OtpAlgorithm) : null;
}

function parseIntParam(raw: string | null, name: string, min: number, max: number, fallback: number): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === "") return { ok: true, value: fallback };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false, error: `${name} must be a whole number between ${min} and ${max}; got "${raw}".` };
  return { ok: true, value: n };
}

/** Parse an `otpauth://totp/...` or `otpauth://hotp/...` URI as written by authenticator apps (Google Authenticator key URI format). */
export function parseOtpauthUri(uri: string): ParseOtpauthResult {
  const text = uri.trim();
  if (text.length > MAX_URI_CHARS) return { ok: false, error: `URI is limited to ${MAX_URI_CHARS} characters.` };
  const m = /^otpauth:\/\/(totp|hotp)\/([^?]*)(?:\?(.*))?$/i.exec(text);
  if (!m) return { ok: false, error: "Expected a URI of the form otpauth://totp/Issuer:account?secret=…" };
  const type = m[1].toLowerCase() as OtpType;
  let label: string;
  try {
    label = decodeURIComponent(m[2]).trim();
  } catch {
    return { ok: false, error: "The label part of the URI has broken percent-encoding." };
  }
  const params = new URLSearchParams(m[3] ?? "");
  const secret = (params.get("secret") ?? "").trim();
  if (!secret) return { ok: false, error: "The URI has no secret parameter." };
  const decoded = base32Decode(secret);
  if (!decoded.ok) return decoded;
  const algorithm = normalizeAlgorithm(params.get("algorithm"));
  if (!algorithm) return { ok: false, error: `Unsupported algorithm "${params.get("algorithm")}". Use SHA1, SHA256 or SHA512.` };
  const digits = parseIntParam(params.get("digits"), "digits", 6, 8, 6);
  if (!digits.ok) return digits;
  const period = parseIntParam(params.get("period"), "period", 1, MAX_PERIOD_SECONDS, 30);
  if (!period.ok) return period;
  const counter = parseIntParam(params.get("counter"), "counter", 0, Number.MAX_SAFE_INTEGER, 0);
  if (!counter.ok) return counter;
  if (type === "hotp" && params.get("counter") === null) return { ok: false, error: "An hotp URI must include a counter parameter." };

  const colon = label.indexOf(":");
  const labelIssuer = colon >= 0 ? label.slice(0, colon).trim() : "";
  const account = colon >= 0 ? label.slice(colon + 1).trim() : label;
  const issuer = (params.get("issuer") ?? labelIssuer).trim();
  return {
    ok: true,
    config: { type, label, issuer, account, secret: secret.toUpperCase().replace(/[\s-]/g, ""), algorithm, digits: digits.value as OtpDigits, period: period.value, counter: counter.value },
  };
}

export interface BuildOtpauthOptions {
  type?: OtpType;
  issuer?: string;
  account: string;
  secret: string;
  algorithm?: OtpAlgorithm;
  digits?: OtpDigits;
  period?: number;
  counter?: number;
}

/** Build the key URI an authenticator app scans. Issuer appears both in the label prefix and as a parameter, per the de-facto spec. */
export function buildOtpauthUri(opts: BuildOtpauthOptions): string {
  const type = opts.type ?? "totp";
  const issuer = (opts.issuer ?? "").trim();
  const account = opts.account.trim();
  const label = issuer ? `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` : encodeURIComponent(account);
  const params = new URLSearchParams();
  params.set("secret", opts.secret.toUpperCase().replace(/[\s-=]/g, ""));
  if (issuer) params.set("issuer", issuer);
  params.set("algorithm", opts.algorithm ?? "SHA1");
  params.set("digits", String(opts.digits ?? 6));
  if (type === "totp") params.set("period", String(opts.period ?? 30));
  else params.set("counter", String(opts.counter ?? 0));
  // URLSearchParams encodes spaces as "+", which some scanners misread in the issuer; use %20 instead.
  return `otpauth://${type}/${label}?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * RFC 4226 HOTP: HMAC over the 8-byte big-endian counter, then dynamic truncation.
 * The secret only ever lives in memory for this call.
 */
export async function generateHotp(secretBytes: Uint8Array, counter: number, algorithm: OtpAlgorithm = "SHA1", digits: OtpDigits = 6): Promise<string> {
  if (!Number.isInteger(counter) || counter < 0 || counter > Number.MAX_SAFE_INTEGER) throw new Error("Counter must be a non-negative integer.");
  // 8-byte big-endian counter, split into two 32-bit halves (no BigInt needed for values up to 2^53).
  const msg = new Uint8Array(8);
  const hi = Math.floor(counter / 2 ** 32);
  const lo = counter % 2 ** 32;
  for (let i = 0; i < 4; i++) {
    msg[i] = (hi >>> (8 * (3 - i))) & 0xff;
    msg[4 + i] = (lo >>> (8 * (3 - i))) & 0xff;
  }
  // Copy into a fresh ArrayBuffer so any Uint8Array view (including ones over a SharedArrayBuffer) satisfies BufferSource.
  const key = await crypto.subtle.importKey("raw", new Uint8Array(secretBytes), { name: "HMAC", hash: WEBCRYPTO_HASH[algorithm] }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export interface GenerateTotpOptions {
  /** Base32 secret. */
  secret: string;
  algorithm?: OtpAlgorithm;
  digits?: OtpDigits;
  period?: number;
  timestampMs?: number;
}

/** RFC 6238 TOTP: HOTP with the counter set to floor(unixSeconds / period). */
export async function generateTotp(opts: GenerateTotpOptions): Promise<TotpResult> {
  const period = opts.period ?? 30;
  if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD_SECONDS) return { ok: false, error: `Period must be a whole number of seconds between 1 and ${MAX_PERIOD_SECONDS}.` };
  const digits = opts.digits ?? 6;
  if (!(OTP_DIGITS as readonly number[]).includes(digits)) return { ok: false, error: "Digits must be 6, 7 or 8." };
  const decoded = base32Decode(opts.secret);
  if (!decoded.ok) return decoded;
  const seconds = Math.floor((opts.timestampMs ?? Date.now()) / 1000);
  if (seconds < 0) return { ok: false, error: "Timestamp must not be before 1970." };
  const counter = Math.floor(seconds / period);
  try {
    const code = await generateHotp(decoded.bytes, counter, opts.algorithm ?? "SHA1", digits);
    return { ok: true, code, remainingSeconds: period - (seconds % period), counter };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not compute the code." };
  }
}
