import { base64UrlToBytes, bytesToBase64, derToPem } from "@/lib/tools/asn1";

export type KeyType = "rsa-2048" | "rsa-3072" | "rsa-4096" | "ec-p256" | "ec-p384" | "ec-p521" | "ed25519";

export interface KeyTypeInfo {
  id: KeyType;
  label: string;
  group: "RSA" | "ECDSA" | "EdDSA";
  /** JWT algorithm the pair is suited for, if any. */
  jwtAlg: string | null;
  /** OpenSSH key type string. */
  sshType: string;
  description: string;
}

export const KEY_TYPES: readonly KeyTypeInfo[] = [
  { id: "rsa-2048", label: "RSA 2048", group: "RSA", jwtAlg: "RS256", sshType: "ssh-rsa", description: "Widely compatible. Fine for JWTs and SSH; 2048 bits is the minimum recommended today." },
  { id: "rsa-3072", label: "RSA 3072", group: "RSA", jwtAlg: "RS256", sshType: "ssh-rsa", description: "Roughly 128-bit security. Slower to generate than 2048." },
  { id: "rsa-4096", label: "RSA 4096", group: "RSA", jwtAlg: "RS256", sshType: "ssh-rsa", description: "Conservative choice; generation can take several seconds." },
  { id: "ec-p256", label: "ECDSA P-256", group: "ECDSA", jwtAlg: "ES256", sshType: "ecdsa-sha2-nistp256", description: "Small keys and fast signatures. The usual choice for ES256 JWTs and TLS." },
  { id: "ec-p384", label: "ECDSA P-384", group: "ECDSA", jwtAlg: "ES384", sshType: "ecdsa-sha2-nistp384", description: "Higher security margin than P-256; ES384 JWTs." },
  { id: "ec-p521", label: "ECDSA P-521", group: "ECDSA", jwtAlg: "ES512", sshType: "ecdsa-sha2-nistp521", description: "Largest NIST curve; ES512 JWTs." },
  { id: "ed25519", label: "Ed25519", group: "EdDSA", jwtAlg: "EdDSA", sshType: "ssh-ed25519", description: "Modern, fast and compact. The recommended SSH key type. Needs a recent browser." },
];

export function keyTypeInfo(type: KeyType): KeyTypeInfo {
  const info = KEY_TYPES.find((k) => k.id === type);
  if (!info) throw new Error(`Unknown key type: ${type}`);
  return info;
}

export interface KeyPairOk {
  ok: true;
  type: KeyType;
  /** SPKI, "-----BEGIN PUBLIC KEY-----". */
  publicPem: string;
  /** PKCS#8, "-----BEGIN PRIVATE KEY-----". */
  privatePem: string;
  /** Pretty-printed JSON. */
  publicJwk: string;
  privateJwk: string;
  /** One-line authorized_keys entry. */
  openssh: string;
  /** "SHA256:..." as printed by ssh-keygen -l. */
  fingerprint: string;
}

export type KeyPairResult = KeyPairOk | { ok: false; error: string };

// ---------------------------------------------------------------------------
// PEM and SSH wire helpers (pure, unit-tested against ssh-keygen output)
// ---------------------------------------------------------------------------

/** Wrap DER bytes in PEM armour. */
export function pemWrap(der: Uint8Array, label: string): string {
  return derToPem(der, label);
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** SSH "string": uint32 big-endian length followed by the bytes (RFC 4251). */
export function encodeSshString(data: Uint8Array | string): Uint8Array {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return concat([u32(bytes.length), bytes]);
}

/**
 * SSH "mpint": two's-complement big-endian with a length prefix. Leading zero
 * bytes are stripped, and a 0x00 is prepended when the high bit is set so the
 * value stays positive (RFC 4251). Zero encodes as an empty string.
 */
export function encodeMpint(magnitude: Uint8Array): Uint8Array {
  let start = 0;
  while (start < magnitude.length && magnitude[start] === 0) start++;
  const stripped = magnitude.subarray(start);
  if (!stripped.length) return u32(0);
  const body = stripped[0] & 0x80 ? concat([new Uint8Array([0]), stripped]) : stripped;
  return concat([u32(body.length), body]);
}

const EC_CURVES: Record<string, { nist: string; bytes: number }> = {
  "P-256": { nist: "nistp256", bytes: 32 },
  "P-384": { nist: "nistp384", bytes: 48 },
  "P-521": { nist: "nistp521", bytes: 66 },
};

function leftPad(bytes: Uint8Array, size: number): Uint8Array {
  if (bytes.length >= size) return bytes;
  const out = new Uint8Array(size);
  out.set(bytes, size - bytes.length);
  return out;
}

function jwkField(jwk: JsonWebKey, key: "n" | "e" | "x" | "y"): Uint8Array {
  const value = jwk[key];
  if (typeof value !== "string" || !value) throw new Error(`JWK is missing "${key}".`);
  return base64UrlToBytes(value);
}

/** The binary public key blob (what sits base64-encoded in an authorized_keys line). */
export function buildSshPublicKeyBlob(jwk: JsonWebKey): { type: string; blob: Uint8Array } {
  if (jwk.kty === "RSA") {
    // RFC 4253: string "ssh-rsa", mpint e, mpint n.
    const blob = concat([encodeSshString("ssh-rsa"), encodeMpint(jwkField(jwk, "e")), encodeMpint(jwkField(jwk, "n"))]);
    return { type: "ssh-rsa", blob };
  }
  if (jwk.kty === "EC") {
    const curve = jwk.crv ? EC_CURVES[jwk.crv] : undefined;
    if (!curve) throw new Error(`Unsupported EC curve: ${jwk.crv ?? "(none)"}.`);
    // RFC 5656: string "ecdsa-sha2-<curve>", string <curve>, string Q (uncompressed point 0x04 || X || Y).
    const type = `ecdsa-sha2-${curve.nist}`;
    const point = concat([new Uint8Array([4]), leftPad(jwkField(jwk, "x"), curve.bytes), leftPad(jwkField(jwk, "y"), curve.bytes)]);
    return { type, blob: concat([encodeSshString(type), encodeSshString(curve.nist), encodeSshString(point)]) };
  }
  if (jwk.kty === "OKP" && jwk.crv === "Ed25519") {
    // RFC 8709: string "ssh-ed25519", string key (32 bytes).
    return { type: "ssh-ed25519", blob: concat([encodeSshString("ssh-ed25519"), encodeSshString(jwkField(jwk, "x"))]) };
  }
  throw new Error(`Unsupported key type: ${jwk.kty ?? "(none)"}.`);
}

/** One-line OpenSSH public key: "<type> <base64 blob> <comment>". */
export function buildOpenSshPublicKey(jwk: JsonWebKey, comment = "devbox"): string {
  const { type, blob } = buildSshPublicKeyBlob(jwk);
  return `${type} ${bytesToBase64(blob)}${comment ? ` ${comment}` : ""}`;
}

/** "SHA256:<base64 without padding>" of the blob, matching `ssh-keygen -lf`. */
export async function sshFingerprint(blob: Uint8Array, subtle: SubtleCrypto = crypto.subtle): Promise<string> {
  const digest = new Uint8Array(await subtle.digest("SHA-256", new Uint8Array(blob)));
  return `SHA256:${bytesToBase64(digest).replace(/=+$/, "")}`;
}

// ---------------------------------------------------------------------------
// Generation (WebCrypto)
// ---------------------------------------------------------------------------

function algorithmFor(type: KeyType): RsaHashedKeyGenParams | EcKeyGenParams | { name: "Ed25519" } {
  switch (type) {
    case "rsa-2048":
    case "rsa-3072":
    case "rsa-4096":
      return { name: "RSASSA-PKCS1-v1_5", modulusLength: Number(type.slice(4)), publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
    case "ec-p256":
      return { name: "ECDSA", namedCurve: "P-256" };
    case "ec-p384":
      return { name: "ECDSA", namedCurve: "P-384" };
    case "ec-p521":
      return { name: "ECDSA", namedCurve: "P-521" };
    case "ed25519":
      return { name: "Ed25519" };
  }
}

/**
 * Generate a key pair with WebCrypto. Everything happens in memory in the
 * caller's browser: the private key is never written anywhere by this module.
 */
export async function generateKeyPair(type: KeyType, subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null): Promise<KeyPairResult> {
  if (!subtle) return { ok: false, error: "Web Crypto is unavailable. Key generation needs a secure context (https or localhost)." };
  let pair: CryptoKeyPair;
  try {
    const generated: unknown = await subtle.generateKey(algorithmFor(type), true, ["sign", "verify"]);
    pair = generated as CryptoKeyPair;
    if (!pair.publicKey || !pair.privateKey) throw new Error("no key pair");
  } catch (e) {
    if (type === "ed25519") return { ok: false, error: "Ed25519 is not supported by this browser yet. Try Chrome 137+, Firefox 130+ or Safari 17+, or pick an ECDSA curve." };
    return { ok: false, error: `Key generation failed: ${e instanceof Error ? e.message : "unknown error"}.` };
  }
  try {
    const [spki, pkcs8, publicJwk, privateJwk] = await Promise.all([
      subtle.exportKey("spki", pair.publicKey),
      subtle.exportKey("pkcs8", pair.privateKey),
      subtle.exportKey("jwk", pair.publicKey),
      subtle.exportKey("jwk", pair.privateKey),
    ]);
    const { blob } = buildSshPublicKeyBlob(publicJwk);
    const fingerprint = await sshFingerprint(blob, subtle);
    // Drop WebCrypto-specific usage hints so the JWK is portable across libraries.
    const clean = (jwk: JsonWebKey): JsonWebKey => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(jwk)) if (k !== "key_ops" && k !== "ext") out[k] = v;
      const alg = keyTypeInfo(type).jwtAlg;
      if (alg) out.alg = alg;
      return out as JsonWebKey;
    };
    return {
      ok: true,
      type,
      publicPem: pemWrap(new Uint8Array(spki), "PUBLIC KEY"),
      privatePem: pemWrap(new Uint8Array(pkcs8), "PRIVATE KEY"),
      publicJwk: JSON.stringify(clean(publicJwk), null, 2),
      privateJwk: JSON.stringify(clean(privateJwk), null, 2),
      openssh: buildOpenSshPublicKey(publicJwk),
      fingerprint,
    };
  } catch (e) {
    return { ok: false, error: `Could not export the generated key: ${e instanceof Error ? e.message : "unknown error"}.` };
  }
}
