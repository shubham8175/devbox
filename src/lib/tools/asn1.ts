/**
 * Minimal, dependency-free DER / ASN.1 reader shared by the certificate
 * decoder and the key pair generator. It only reads: it never evaluates or
 * executes anything from the input, and parsing is bounded by input size so
 * hostile data cannot hang the tab.
 */

/** DER inputs above this size are rejected before parsing (1 MB). */
export const ASN1_MAX_BYTES = 1_048_576;
/** Upper bound on decoded nodes; every node costs at least 2 bytes so this is generous. */
const ASN1_MAX_NODES = 200_000;

export type Asn1TagClass = 0 | 1 | 2 | 3; // universal, application, context-specific, private

export interface Asn1Node {
  tagClass: Asn1TagClass;
  constructed: boolean;
  tag: number;
  /** Offset of the first header (tag) byte. */
  start: number;
  headerLength: number;
  /** Content length in bytes. */
  length: number;
  /** Offset just past the last content byte. */
  end: number;
  /** Present for constructed nodes after parseDer. */
  children?: Asn1Node[];
}

export class Asn1Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Asn1Error";
  }
}

/** Universal tag numbers used by X.509 and key encodings. */
export const TAG = {
  BOOLEAN: 1,
  INTEGER: 2,
  BIT_STRING: 3,
  OCTET_STRING: 4,
  NULL: 5,
  OID: 6,
  UTF8_STRING: 12,
  SEQUENCE: 16,
  SET: 17,
  NUMERIC_STRING: 18,
  PRINTABLE_STRING: 19,
  T61_STRING: 20,
  IA5_STRING: 22,
  UTC_TIME: 23,
  GENERALIZED_TIME: 24,
  VISIBLE_STRING: 26,
  UNIVERSAL_STRING: 28,
  BMP_STRING: 30,
} as const;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function readNode(bytes: Uint8Array, offset: number, limit: number): Asn1Node {
  if (offset + 2 > limit) throw new Asn1Error(`Unexpected end of data at byte ${offset}.`);
  const first = bytes[offset];
  const tagClass = (first >> 6) as Asn1TagClass;
  const constructed = (first & 0x20) !== 0;
  let tag = first & 0x1f;
  let pos = offset + 1;
  if (tag === 0x1f) {
    // High-tag-number form: base-128 digits, high bit marks continuation.
    tag = 0;
    let digits = 0;
    for (;;) {
      if (pos >= limit) throw new Asn1Error(`Unexpected end of data in tag at byte ${offset}.`);
      const b = bytes[pos++];
      tag = tag * 128 + (b & 0x7f);
      if (++digits > 4) throw new Asn1Error(`Tag number at byte ${offset} is too large.`);
      if ((b & 0x80) === 0) break;
    }
  }
  if (pos >= limit) throw new Asn1Error(`Unexpected end of data in length at byte ${offset}.`);
  let length = bytes[pos++];
  if (length === 0x80) throw new Asn1Error(`Indefinite length at byte ${offset} is not allowed in DER.`);
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n > 4) throw new Asn1Error(`Length field at byte ${offset} is too long.`);
    if (pos + n > limit) throw new Asn1Error(`Unexpected end of data in length at byte ${offset}.`);
    length = 0;
    for (let i = 0; i < n; i++) length = length * 256 + bytes[pos++];
  }
  const headerLength = pos - offset;
  const available = limit - offset - headerLength;
  if (length > available) throw new Asn1Error(`Element at byte ${offset} claims ${length} bytes but only ${available} remain.`);
  return { tagClass, constructed, tag, start: offset, headerLength, length, end: offset + headerLength + length };
}

/**
 * Parse one DER element starting at `start` (default: the whole buffer) and,
 * iteratively, everything nested inside it. Throws Asn1Error on malformed
 * input. Trailing bytes after the element are ignored; check `node.end`.
 */
export function parseDer(bytes: Uint8Array, start = 0, limit = bytes.length): Asn1Node {
  if (bytes.length > ASN1_MAX_BYTES) throw new Asn1Error("Input is larger than 1 MB.");
  if (limit > bytes.length) limit = bytes.length;
  const root = readNode(bytes, start, limit);
  const stack: Asn1Node[] = [root];
  let count = 1;
  while (stack.length) {
    const node = stack.pop();
    if (!node || !node.constructed) continue;
    const children: Asn1Node[] = [];
    let pos = node.start + node.headerLength;
    while (pos < node.end) {
      const child = readNode(bytes, pos, node.end);
      if (++count > ASN1_MAX_NODES) throw new Asn1Error("Structure has too many elements.");
      children.push(child);
      stack.push(child);
      pos = child.end;
    }
    node.children = children;
  }
  return root;
}

/** Content bytes of a node (a view, not a copy). */
export function content(bytes: Uint8Array, node: Asn1Node): Uint8Array {
  return bytes.subarray(node.start + node.headerLength, node.end);
}

export function isUniversal(node: Asn1Node, tag: number): boolean {
  return node.tagClass === 0 && node.tag === tag;
}

export function isContext(node: Asn1Node, tag: number): boolean {
  return node.tagClass === 2 && node.tag === tag;
}

/** Throws unless the node is the expected universal tag. */
export function expect(node: Asn1Node | undefined, tag: number, what: string): Asn1Node {
  if (!node) throw new Asn1Error(`Missing ${what}.`);
  if (!isUniversal(node, tag)) throw new Asn1Error(`Expected ${what} (tag ${tag}) but found tag ${node.tag} at byte ${node.start}.`);
  return node;
}

// ---------------------------------------------------------------------------
// Primitive readers
// ---------------------------------------------------------------------------

export function oidToString(bytes: Uint8Array): string {
  if (!bytes.length) throw new Asn1Error("Empty OBJECT IDENTIFIER.");
  const arcs: string[] = [];
  let value = BigInt(0);
  let first = true;
  let digits = 0;
  for (const b of bytes) {
    value = value * BigInt(128) + BigInt(b & 0x7f);
    if (++digits > 20) throw new Asn1Error("OBJECT IDENTIFIER arc is too large.");
    if (b & 0x80) continue;
    if (first) {
      // The first two arcs are packed into one value: 40 * arc1 + arc2.
      if (value < BigInt(80)) arcs.push(String(value / BigInt(40)), String(value % BigInt(40)));
      else arcs.push("2", String(value - BigInt(80)));
      first = false;
    } else {
      arcs.push(String(value));
    }
    value = BigInt(0);
    digits = 0;
  }
  if (digits) throw new Asn1Error("Truncated OBJECT IDENTIFIER.");
  return arcs.join(".");
}

export interface Asn1Integer {
  /** Magnitude as lowercase hex without leading zero bytes ("00" for zero). */
  hex: string;
  /** Signed decimal value as a string (arbitrary precision). */
  decimal: string;
  negative: boolean;
  /** Bit length of the magnitude (e.g. 2048 for an RSA-2048 modulus). */
  bits: number;
}

export function readInteger(bytes: Uint8Array): Asn1Integer {
  if (!bytes.length) throw new Asn1Error("Empty INTEGER.");
  if (bytes.length > 4096) throw new Asn1Error("INTEGER is too large.");
  let value = BigInt(0);
  for (const b of bytes) value = (value << BigInt(8)) | BigInt(b);
  const negative = (bytes[0] & 0x80) !== 0;
  if (negative) value -= BigInt(1) << BigInt(bytes.length * 8);
  const magnitude = negative ? -value : value;
  let hex = magnitude.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return { hex, decimal: value.toString(10), negative, bits: magnitude === BigInt(0) ? 0 : magnitude.toString(2).length };
}

export interface Asn1BitString {
  unusedBits: number;
  bytes: Uint8Array;
}

export function readBitString(bytes: Uint8Array): Asn1BitString {
  if (!bytes.length) throw new Asn1Error("Empty BIT STRING.");
  const unusedBits = bytes[0];
  if (unusedBits > 7) throw new Asn1Error("BIT STRING has an invalid unused-bits count.");
  return { unusedBits, bytes: bytes.subarray(1) };
}

/** Names of the bits of a BIT STRING that are set, in bit order (bit 0 = MSB of first byte). */
export function bitStringFlags(bits: Asn1BitString, names: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const byte = bits.bytes[i >> 3];
    if (byte === undefined) break;
    if (byte & (0x80 >> (i & 7))) out.push(names[i]);
  }
  return out;
}

function utcDate(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, offsetMinutes: number): Date | null {
  const t = Date.UTC(y, mo - 1, d, h, mi, s, ms) - offsetMinutes * 60_000;
  const date = new Date(t);
  if (Number.isNaN(t) || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function parseOffset(z: string | undefined): number {
  if (!z || z === "Z") return 0;
  const sign = z[0] === "-" ? -1 : 1;
  return sign * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)));
}

/** UTCTime: YYMMDDHHMM[SS](Z|+hhmm|-hhmm). Two-digit years 50–99 are 19xx, 00–49 are 20xx (RFC 5280). */
export function readUtcTime(text: string): Date | null {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})?$/.exec(text);
  if (!m) return null;
  const yy = Number(m[1]);
  return utcDate(yy >= 50 ? 1900 + yy : 2000 + yy, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0), 0, parseOffset(m[7]));
}

/** GeneralizedTime: YYYYMMDDHH[MM[SS[.fff]]](Z|+hhmm|-hhmm)? */
export function readGeneralizedTime(text: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?(\d{2})?(?:[.,](\d{1,3})\d*)?(Z|[+-]\d{4})?$/.exec(text);
  if (!m) return null;
  const ms = m[7] ? Number(m[7].padEnd(3, "0")) : 0;
  return utcDate(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5] ?? 0), Number(m[6] ?? 0), ms, parseOffset(m[8]));
}

/** Read a Time CHOICE node (UTCTime or GeneralizedTime). */
export function readTime(bytes: Uint8Array, node: Asn1Node): Date | null {
  const text = latin1(content(bytes, node));
  if (isUniversal(node, TAG.UTC_TIME)) return readUtcTime(text);
  if (isUniversal(node, TAG.GENERALIZED_TIME)) return readGeneralizedTime(text);
  return null;
}

function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Decode an ASN.1 string type by tag. Unknown tags fall back to hex. */
export function readString(tag: number, bytes: Uint8Array): string {
  switch (tag) {
    case TAG.UTF8_STRING:
      return new TextDecoder("utf-8").decode(bytes);
    case TAG.PRINTABLE_STRING:
    case TAG.IA5_STRING:
    case TAG.NUMERIC_STRING:
    case TAG.VISIBLE_STRING:
    case TAG.T61_STRING:
      return latin1(bytes);
    case TAG.BMP_STRING: {
      let s = "";
      for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      return s;
    }
    case TAG.UNIVERSAL_STRING: {
      let s = "";
      for (let i = 0; i + 3 < bytes.length; i += 4) {
        const cp = ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
        s += cp <= 0x10ffff ? String.fromCodePoint(cp) : "�";
      }
      return s;
    }
    default:
      return "#" + bytesToHex(bytes);
  }
}

export function isStringTag(tag: number): boolean {
  return tag === TAG.UTF8_STRING || tag === TAG.PRINTABLE_STRING || tag === TAG.IA5_STRING || tag === TAG.NUMERIC_STRING || tag === TAG.VISIBLE_STRING || tag === TAG.T61_STRING || tag === TAG.BMP_STRING || tag === TAG.UNIVERSAL_STRING;
}

// ---------------------------------------------------------------------------
// OID names
// ---------------------------------------------------------------------------

export const OID_NAMES: Readonly<Record<string, string>> = {
  // RDN attributes
  "2.5.4.3": "CN",
  "2.5.4.4": "SN",
  "2.5.4.5": "serialNumber",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.9": "street",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "2.5.4.12": "title",
  "2.5.4.15": "businessCategory",
  "2.5.4.17": "postalCode",
  "2.5.4.42": "GN",
  "1.2.840.113549.1.9.1": "emailAddress",
  "0.9.2342.19200300.100.1.25": "DC",
  "0.9.2342.19200300.100.1.1": "UID",
  "1.3.6.1.4.1.311.60.2.1.2": "jurisdictionST",
  "1.3.6.1.4.1.311.60.2.1.3": "jurisdictionC",
  // Public key & signature algorithms
  "1.2.840.113549.1.1.1": "rsaEncryption",
  "1.2.840.113549.1.1.5": "sha1WithRSAEncryption",
  "1.2.840.113549.1.1.10": "RSASSA-PSS",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.10045.2.1": "id-ecPublicKey",
  "1.2.840.10045.4.1": "ecdsa-with-SHA1",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
  "1.3.101.110": "X25519",
  "1.3.101.111": "X448",
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448",
  // Curves
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
  "1.3.132.0.10": "secp256k1",
  // Hashes
  "1.3.14.3.2.26": "SHA-1",
  "2.16.840.1.101.3.4.2.1": "SHA-256",
  "2.16.840.1.101.3.4.2.2": "SHA-384",
  "2.16.840.1.101.3.4.2.3": "SHA-512",
  // Extensions
  "2.5.29.14": "subjectKeyIdentifier",
  "2.5.29.15": "keyUsage",
  "2.5.29.17": "subjectAltName",
  "2.5.29.18": "issuerAltName",
  "2.5.29.19": "basicConstraints",
  "2.5.29.30": "nameConstraints",
  "2.5.29.31": "cRLDistributionPoints",
  "2.5.29.32": "certificatePolicies",
  "2.5.29.35": "authorityKeyIdentifier",
  "2.5.29.37": "extKeyUsage",
  "1.3.6.1.5.5.7.1.1": "authorityInfoAccess",
  "1.3.6.1.5.5.7.1.24": "tlsFeature",
  "1.3.6.1.4.1.11129.2.4.2": "ctPrecertificateSCTs",
  "1.3.6.1.4.1.11129.2.4.3": "ctPrecertificatePoison",
  "2.16.840.1.113730.1.1": "nsCertType",
  "2.16.840.1.113730.1.13": "nsComment",
  // Extended key usage
  "2.5.29.37.0": "anyExtendedKeyUsage",
  "1.3.6.1.5.5.7.3.1": "serverAuth",
  "1.3.6.1.5.5.7.3.2": "clientAuth",
  "1.3.6.1.5.5.7.3.3": "codeSigning",
  "1.3.6.1.5.5.7.3.4": "emailProtection",
  "1.3.6.1.5.5.7.3.8": "timeStamping",
  "1.3.6.1.5.5.7.3.9": "OCSPSigning",
  // Authority info access
  "1.3.6.1.5.5.7.48.1": "OCSP",
  "1.3.6.1.5.5.7.48.2": "caIssuers",
  // Certificate policies
  "2.5.29.32.0": "anyPolicy",
  "2.23.140.1.1": "extended-validation",
  "2.23.140.1.2.1": "domain-validated",
  "2.23.140.1.2.2": "organization-validated",
  "2.23.140.1.2.3": "individual-validated",
  "1.3.6.1.5.5.7.2.1": "cps",
};

/** Friendly name for an OID, or the dotted OID itself when unknown. */
export function oidName(oid: string): string {
  return OID_NAMES[oid] ?? oid;
}

// ---------------------------------------------------------------------------
// Bytes, base64 and PEM
// ---------------------------------------------------------------------------

export function bytesToHex(bytes: Uint8Array, separator = "", upper = false): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) parts.push(bytes[i].toString(16).padStart(2, "0"));
  const hex = parts.join(separator);
  return upper ? hex.toUpperCase() : hex;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Decode standard base64 (whitespace is stripped first). Throws on invalid input. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error("Not valid base64.");
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(s: string): Uint8Array {
  return base64ToBytes(s.replace(/-/g, "+").replace(/_/g, "/"));
}

export interface PemBlock {
  label: string;
  der: Uint8Array;
}

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;

/** Every armoured block in the text, in order. Blocks with undecodable bodies are skipped. */
export function pemBlocks(text: string): PemBlock[] {
  const out: PemBlock[] = [];
  for (const m of text.matchAll(PEM_BLOCK)) {
    try {
      out.push({ label: m[1].trim(), der: base64ToBytes(m[2]) });
    } catch {
      // ignore: an undecodable block is reported by pemToDer when it is the only one
    }
  }
  return out;
}

export type PemResult = { ok: true; der: Uint8Array; label: string } | { ok: false; error: string };

/**
 * Decode the first PEM block, or raw base64 without armour (label "").
 * Whitespace anywhere is ignored.
 */
export function pemToDer(text: string): PemResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Input is empty." };
  if (trimmed.length > ASN1_MAX_BYTES * 2) return { ok: false, error: "Input is larger than 2 MB." };
  if (trimmed.includes("-----BEGIN")) {
    const blocks = pemBlocks(trimmed);
    if (!blocks.length) {
      return { ok: false, error: "Found a -----BEGIN line but no complete, valid PEM block. Check that the END line matches and the body is base64." };
    }
    return { ok: true, der: blocks[0].der, label: blocks[0].label };
  }
  try {
    const der = base64ToBytes(trimmed);
    if (!der.length) return { ok: false, error: "Input is empty." };
    return { ok: true, der, label: "" };
  } catch {
    return { ok: false, error: "Input is neither a PEM block nor base64." };
  }
}

/** Wrap DER bytes in PEM armour with 64-column lines. */
export function derToPem(der: Uint8Array, label: string): string {
  const b64 = bytesToBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
