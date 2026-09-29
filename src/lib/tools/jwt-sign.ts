import { decodeJwt } from "@/lib/tools/jwt";
import type { JsonValue } from "@/lib/tools/json";

export const JWT_SIGN_ALGORITHMS = ["HS256", "HS384", "HS512"] as const;
export type JwtSignAlgorithm = (typeof JWT_SIGN_ALGORITHMS)[number];

/** Payload JSON is capped so a pasted blob cannot stall the tab while it is re-signed on every keystroke. */
export const JWT_SIGN_MAX_PAYLOAD = 64 * 1024;

const HASH_FOR_ALG: Record<JwtSignAlgorithm, "SHA-256" | "SHA-384" | "SHA-512"> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

export const JWT_SIGN_SAMPLE = {
  payload: '{\n  "sub": "user_42",\n  "name": "Ada Lovelace",\n  "role": "admin"\n}',
  secret: "devbox-secret",
} as const;

export type JsonObject = Record<string, JsonValue>;

export interface StandardClaimOptions {
  /** Set `iat` to now. */
  iat: boolean;
  /** Set `exp` to now + this many seconds. Omit to leave `exp` alone. */
  expInSeconds?: number;
  /** Set `nbf` to this Unix timestamp (seconds). */
  nbf?: number;
  /** Add a random `jti` (crypto.randomUUID). */
  jti?: boolean;
}

export interface SignJwtInput {
  /** Extra header JSON (text). Merged over `{ alg, typ: "JWT" }`. Empty means none. */
  header?: string;
  /** Payload JSON text. */
  payload: string;
  secret: string;
  algorithm: JwtSignAlgorithm;
  /** Optional standard claims to fill in before signing. */
  claims?: StandardClaimOptions;
  /** Clock used for iat/exp. Defaults to Date.now(). */
  nowMs?: number;
}

export type SignJwtResult = { ok: true; token: string; header: JsonObject; payload: JsonObject } | { ok: false; error: string };
export type VerifyJwtResult = { ok: true; valid: boolean; algorithm: JwtSignAlgorithm } | { ok: false; error: string };
export type DecodeForEditResult = { ok: true; header: string; payload: string; algorithm: JwtSignAlgorithm | null } | { ok: false; error: string };

function isSignAlgorithm(v: unknown): v is JwtSignAlgorithm {
  return typeof v === "string" && (JWT_SIGN_ALGORITHMS as readonly string[]).includes(v);
}

export function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeBytes(segment: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) return null;
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Parse JSON text into a plain object without inheriting a prototype, dropping keys that could poison one. */
function parseJsonObject(text: string, name: string): { ok: true; value: JsonObject } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `${name} is not valid JSON: ${e instanceof Error ? e.message : "parse error"}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: `${name} must be a JSON object.` };
  const value: JsonObject = Object.create(null) as JsonObject;
  for (const [k, v] of Object.entries(parsed as Record<string, JsonValue>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    value[k] = v;
  }
  return { ok: true, value };
}

/**
 * Fill in the standard time / id claims. Returns a new object; user-supplied
 * claims are only overwritten for the options that are switched on.
 */
export function withStandardClaims(payload: JsonObject, opts: StandardClaimOptions, nowMs: number = Date.now()): JsonObject {
  const out: JsonObject = Object.create(null) as JsonObject;
  Object.assign(out, payload);
  const nowSec = Math.floor(nowMs / 1000);
  if (opts.iat) out.iat = nowSec;
  if (opts.expInSeconds !== undefined) out.exp = nowSec + Math.floor(opts.expInSeconds);
  if (opts.nbf !== undefined) out.nbf = Math.floor(opts.nbf);
  if (opts.jti) out.jti = crypto.randomUUID();
  return out;
}

async function hmacSign(algorithm: JwtSignAlgorithm, secret: string, signingInput: string): Promise<Uint8Array> {
  // The secret is held in memory only for the duration of this call; it is never logged, stored or sent anywhere.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: HASH_FOR_ALG[algorithm] }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(signingInput)));
}

/** Build and sign a JWT with an HMAC secret, entirely in the browser. */
export async function signJwt(input: SignJwtInput): Promise<SignJwtResult> {
  if (!isSignAlgorithm(input.algorithm)) return { ok: false, error: "Only HS256, HS384 and HS512 are supported here. For RS/ES tokens use a private key from the Key Pair Generator." };
  if (!input.secret) return { ok: false, error: "Enter a secret. Web Crypto does not support empty HMAC keys." };
  if (input.payload.length > JWT_SIGN_MAX_PAYLOAD) return { ok: false, error: `Payload JSON is limited to ${JWT_SIGN_MAX_PAYLOAD / 1024} KB.` };
  if ((input.header ?? "").length > JWT_SIGN_MAX_PAYLOAD) return { ok: false, error: `Header JSON is limited to ${JWT_SIGN_MAX_PAYLOAD / 1024} KB.` };

  const extra = input.header?.trim() ? parseJsonObject(input.header, "Header") : { ok: true as const, value: Object.create(null) as JsonObject };
  if (!extra.ok) return extra;
  const alg = extra.value.alg;
  if (alg !== undefined) {
    if (alg === "none") return { ok: false, error: '"alg": "none" produces an unsigned token and is rejected. Pick an HMAC algorithm.' };
    if (!isSignAlgorithm(alg)) return { ok: false, error: `Header alg "${String(alg)}" is not an HMAC algorithm. Only HS256, HS384 and HS512 can be signed with a secret.` };
    if (alg !== input.algorithm) return { ok: false, error: `Header alg "${alg}" does not match the selected algorithm ${input.algorithm}.` };
  }
  const header: JsonObject = Object.create(null) as JsonObject;
  header.alg = input.algorithm;
  header.typ = "JWT";
  Object.assign(header, extra.value);
  header.alg = input.algorithm;

  const parsedPayload = input.payload.trim() ? parseJsonObject(input.payload, "Payload") : { ok: true as const, value: Object.create(null) as JsonObject };
  if (!parsedPayload.ok) return parsedPayload;
  const payload = input.claims ? withStandardClaims(parsedPayload.value, input.claims, input.nowMs) : parsedPayload.value;

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = await hmacSign(input.algorithm, input.secret, signingInput);
  return { ok: true, token: `${signingInput}.${base64UrlEncode(signature)}`, header, payload };
}

/** Compare two byte arrays without short-circuiting, so timing does not reveal where they first differ. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Re-sign the token with the given secret and compare signatures in constant time. */
export async function verifyJwt(rawToken: string, secret: string): Promise<VerifyJwtResult> {
  const decoded = decodeJwt(rawToken);
  if (!decoded.ok) return decoded;
  if (!secret) return { ok: false, error: "Enter the secret the token was signed with." };
  const alg = decoded.header.alg;
  if (alg === "none") return { ok: false, error: 'This token uses "alg": "none" and carries no signature to verify. Treat it as unsigned.' };
  if (!isSignAlgorithm(alg)) return { ok: false, error: `Token algorithm "${String(alg)}" is not HMAC-based. Only HS256, HS384 and HS512 can be checked with a shared secret.` };
  const [h, p] = rawToken.trim().replace(/^Bearer\s+/i, "").split(".");
  const expected = await hmacSign(alg, secret, `${h}.${p}`);
  const actual = base64UrlDecodeBytes(decoded.signature);
  return { ok: true, valid: actual !== null && constantTimeEqual(expected, actual), algorithm: alg };
}

/** Decode an existing token into editable header/payload JSON so it can be re-signed. */
export function decodeForEdit(rawToken: string): DecodeForEditResult {
  const decoded = decodeJwt(rawToken);
  if (!decoded.ok) return decoded;
  const alg = decoded.header.alg;
  return { ok: true, header: decoded.headerRaw, payload: decoded.payloadRaw, algorithm: isSignAlgorithm(alg) ? alg : null };
}

/** Rewrite the `alg` field of header JSON text, leaving any other fields untouched. Returns the input unchanged when it is not a JSON object. */
export function setHeaderAlgorithm(headerText: string, algorithm: JwtSignAlgorithm): string {
  const parsed = parseJsonObject(headerText.trim() || "{}", "Header");
  if (!parsed.ok) return headerText;
  const next: JsonObject = Object.create(null) as JsonObject;
  next.alg = algorithm;
  next.typ = "JWT";
  Object.assign(next, parsed.value);
  next.alg = algorithm;
  return JSON.stringify(next, null, 2);
}

export function defaultHeaderText(algorithm: JwtSignAlgorithm): string {
  return JSON.stringify({ alg: algorithm, typ: "JWT" }, null, 2);
}
