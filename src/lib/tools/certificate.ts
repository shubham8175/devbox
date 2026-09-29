import {
  Asn1Error,
  ASN1_MAX_BYTES,
  TAG,
  bitStringFlags,
  bytesToHex,
  content,
  expect as expectTag,
  isContext,
  isStringTag,
  isUniversal,
  oidName,
  oidToString,
  parseDer,
  pemBlocks,
  pemToDer,
  readBitString,
  readInteger,
  readString,
  readTime,
  type Asn1Node,
} from "@/lib/tools/asn1";

export interface RdnAttribute {
  oid: string;
  /** Short name such as CN or O, or the dotted OID when unknown. */
  name: string;
  value: string;
}

export interface CertName {
  attributes: RdnAttribute[];
  /** One-line rendering in certificate order: "CN=devbox.example, O=DevBox". */
  oneLine: string;
}

export interface CertPublicKey {
  algorithm: string;
  oid: string;
  /** RSA modulus size or EC field size in bits. */
  bits: number | null;
  /** RSA public exponent (decimal), when applicable. */
  exponent: string | null;
  curve: string | null;
  /** Human summary: "RSA 2048-bit, e=65537". */
  summary: string;
}

export interface CertExtension {
  oid: string;
  name: string;
  critical: boolean;
  /** Whether this decoder understands the extension. */
  known: boolean;
  /** One-line human-readable value (hex for unknown extensions). */
  value: string;
}

export interface CertSan {
  dns: string[];
  ip: string[];
  email: string[];
  uri: string[];
  other: string[];
}

export interface CertStatus {
  state: "valid" | "expired" | "not-yet-valid";
  /** Days until notAfter (negative once expired). */
  daysRemaining: number;
  message: string;
}

export interface CertOk {
  ok: true;
  der: Uint8Array;
  /** Number of CERTIFICATE blocks in the input; only the first is decoded. */
  chainCount: number;
  version: number;
  serialHex: string;
  serialDecimal: string;
  signatureAlgorithm: string;
  signatureAlgorithmOid: string;
  issuer: CertName;
  subject: CertName;
  selfSigned: boolean;
  notBefore: Date;
  notAfter: Date;
  notBeforeIso: string;
  notAfterIso: string;
  validityDays: number;
  status: CertStatus;
  publicKey: CertPublicKey;
  extensions: CertExtension[];
  unknownExtensions: Array<{ oid: string; critical: boolean }>;
  san: CertSan | null;
  basicConstraints: { ca: boolean; pathLen: number | null } | null;
  keyUsage: string[] | null;
  extKeyUsage: string[] | null;
  subjectKeyId: string | null;
  authorityKeyId: string | null;
}

export interface CertError {
  ok: false;
  error: string;
}

const DAY_MS = 86_400_000;

const KEY_USAGE_BITS = ["digitalSignature", "nonRepudiation", "keyEncipherment", "dataEncipherment", "keyAgreement", "keyCertSign", "cRLSign", "encipherOnly", "decipherOnly"] as const;

const CERT_LABELS = new Set(["CERTIFICATE", "X509 CERTIFICATE", "TRUSTED CERTIFICATE"]);

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

function readName(bytes: Uint8Array, node: Asn1Node): CertName {
  expectTag(node, TAG.SEQUENCE, "Name");
  const attributes: RdnAttribute[] = [];
  const parts: string[] = [];
  for (const rdn of node.children ?? []) {
    expectTag(rdn, TAG.SET, "RelativeDistinguishedName");
    const rdnParts: string[] = [];
    for (const atv of rdn.children ?? []) {
      expectTag(atv, TAG.SEQUENCE, "AttributeTypeAndValue");
      const [typeNode, valueNode] = atv.children ?? [];
      const oid = oidToString(content(bytes, expectTag(typeNode, TAG.OID, "attribute type")));
      if (!valueNode) throw new Asn1Error("Attribute has no value.");
      const raw = content(bytes, valueNode);
      const value = valueNode.tagClass === 0 && isStringTag(valueNode.tag) ? readString(valueNode.tag, raw) : "#" + bytesToHex(raw);
      const name = oidName(oid);
      attributes.push({ oid, name, value });
      rdnParts.push(`${name}=${value}`);
    }
    parts.push(rdnParts.join(" + "));
  }
  return { attributes, oneLine: parts.join(", ") };
}

// ---------------------------------------------------------------------------
// Algorithms and public keys
// ---------------------------------------------------------------------------

function readAlgorithm(bytes: Uint8Array, node: Asn1Node): { oid: string; params: Asn1Node | undefined } {
  expectTag(node, TAG.SEQUENCE, "AlgorithmIdentifier");
  const [oidNode, params] = node.children ?? [];
  return { oid: oidToString(content(bytes, expectTag(oidNode, TAG.OID, "algorithm OID"))), params };
}

function readPublicKey(bytes: Uint8Array, node: Asn1Node): CertPublicKey {
  expectTag(node, TAG.SEQUENCE, "SubjectPublicKeyInfo");
  const [algNode, keyNode] = node.children ?? [];
  const { oid, params } = readAlgorithm(bytes, algNode);
  const key = readBitString(content(bytes, expectTag(keyNode, TAG.BIT_STRING, "subjectPublicKey")));
  const algorithm = oidName(oid);

  if (oid === "1.2.840.113549.1.1.1" || oid === "1.2.840.113549.1.1.10") {
    // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
    const rsa = parseDer(key.bytes);
    expectTag(rsa, TAG.SEQUENCE, "RSAPublicKey");
    const [n, e] = rsa.children ?? [];
    const modulus = readInteger(content(key.bytes, expectTag(n, TAG.INTEGER, "modulus")));
    const exponent = readInteger(content(key.bytes, expectTag(e, TAG.INTEGER, "publicExponent")));
    return { algorithm: "RSA", oid, bits: modulus.bits, exponent: exponent.decimal, curve: null, summary: `RSA ${modulus.bits}-bit, e=${exponent.decimal}` };
  }
  if (oid === "1.2.840.10045.2.1") {
    const curveOid = params && isUniversal(params, TAG.OID) ? oidToString(content(bytes, params)) : null;
    const curve = curveOid ? oidName(curveOid) : "unknown curve";
    // Uncompressed point: 0x04 || X || Y, so the field size is half the remainder.
    const bits = key.bytes[0] === 4 ? ((key.bytes.length - 1) / 2) * 8 : null;
    return { algorithm: "EC", oid, bits, exponent: null, curve, summary: `EC ${curve}${bits ? ` (${bits}-bit)` : ""}` };
  }
  if (oid === "1.3.101.112" || oid === "1.3.101.113" || oid === "1.3.101.110" || oid === "1.3.101.111") {
    return { algorithm, oid, bits: key.bytes.length * 8, exponent: null, curve: algorithm, summary: `${algorithm} (${key.bytes.length * 8}-bit)` };
  }
  return { algorithm, oid, bits: null, exponent: null, curve: null, summary: `${algorithm} (${key.bytes.length} bytes)` };
}

// ---------------------------------------------------------------------------
// Extensions
// ---------------------------------------------------------------------------

function formatIp(bytes: Uint8Array): string {
  if (bytes.length === 4) return Array.from(bytes).join(".");
  if (bytes.length === 16) {
    const groups: number[] = [];
    for (let i = 0; i < 16; i += 2) groups.push((bytes[i] << 8) | bytes[i + 1]);
    // Compress the longest run of zero groups (at least two long) with "::".
    let bestStart = -1;
    let bestLen = 0;
    for (let i = 0; i < 8; i++) {
      if (groups[i] !== 0) continue;
      let j = i;
      while (j < 8 && groups[j] === 0) j++;
      if (j - i > bestLen) {
        bestStart = i;
        bestLen = j - i;
      }
      i = j;
    }
    const hex = groups.map((g) => g.toString(16));
    if (bestLen >= 2) {
      const head = hex.slice(0, bestStart).join(":");
      const tail = hex.slice(bestStart + bestLen).join(":");
      return `${head}::${tail}`;
    }
    return hex.join(":");
  }
  // Name-constraint form: address followed by a mask of the same length.
  if (bytes.length === 8 || bytes.length === 32) {
    const half = bytes.length / 2;
    return `${formatIp(bytes.subarray(0, half))}/${formatIp(bytes.subarray(half))}`;
  }
  return "#" + bytesToHex(bytes);
}

type GeneralName = { kind: keyof CertSan; value: string };

function readGeneralName(bytes: Uint8Array, node: Asn1Node): GeneralName {
  const raw = content(bytes, node);
  if (node.tagClass !== 2) return { kind: "other", value: "#" + bytesToHex(raw) };
  switch (node.tag) {
    case 1:
      return { kind: "email", value: readString(TAG.IA5_STRING, raw) };
    case 2:
      return { kind: "dns", value: readString(TAG.IA5_STRING, raw) };
    case 6:
      return { kind: "uri", value: readString(TAG.IA5_STRING, raw) };
    case 7:
      return { kind: "ip", value: formatIp(raw) };
    case 4: {
      const inner = node.children?.[0];
      return { kind: "other", value: `DirName:${inner ? readName(bytes, inner).oneLine : ""}` };
    }
    case 8:
      return { kind: "other", value: `RID:${oidToString(raw)}` };
    case 0: {
      const oidNode = node.children?.[0];
      return { kind: "other", value: `otherName:${oidNode && isUniversal(oidNode, TAG.OID) ? oidName(oidToString(content(bytes, oidNode))) : "?"}` };
    }
    default:
      return { kind: "other", value: `[${node.tag}]#${bytesToHex(raw)}` };
  }
}

function readGeneralNames(bytes: Uint8Array, node: Asn1Node): GeneralName[] {
  return (node.children ?? []).map((n) => readGeneralName(bytes, n));
}

const SAN_LABEL: Record<keyof CertSan, string> = { dns: "DNS", ip: "IP", email: "email", uri: "URI", other: "" };

function formatGeneralName(g: GeneralName): string {
  return SAN_LABEL[g.kind] ? `${SAN_LABEL[g.kind]}:${g.value}` : g.value;
}

interface DecodedExtensions {
  extensions: CertExtension[];
  san: CertSan | null;
  basicConstraints: CertOk["basicConstraints"];
  keyUsage: string[] | null;
  extKeyUsage: string[] | null;
  subjectKeyId: string | null;
  authorityKeyId: string | null;
}

function readExtensions(bytes: Uint8Array, node: Asn1Node | undefined): DecodedExtensions {
  const out: DecodedExtensions = { extensions: [], san: null, basicConstraints: null, keyUsage: null, extKeyUsage: null, subjectKeyId: null, authorityKeyId: null };
  if (!node) return out;
  const seq = expectTag(node.children?.[0], TAG.SEQUENCE, "Extensions");
  for (const ext of seq.children ?? []) {
    expectTag(ext, TAG.SEQUENCE, "Extension");
    const children = ext.children ?? [];
    const oid = oidToString(content(bytes, expectTag(children[0], TAG.OID, "extension OID")));
    let critical = false;
    let valueNode = children[1];
    if (valueNode && isUniversal(valueNode, TAG.BOOLEAN)) {
      critical = content(bytes, valueNode)[0] !== 0;
      valueNode = children[2];
    }
    const raw = content(bytes, expectTag(valueNode, TAG.OCTET_STRING, "extension value"));
    const name = oidName(oid);
    let decoded: { known: boolean; value: string };
    try {
      decoded = decodeExtension(oid, raw, out);
    } catch {
      // A malformed extension should not sink the whole certificate; show it raw.
      decoded = { known: false, value: "#" + bytesToHex(raw) };
    }
    out.extensions.push({ oid, name, critical, known: decoded.known, value: decoded.value });
  }
  return out;
}

function decodeExtension(oid: string, raw: Uint8Array, out: DecodedExtensions): { known: boolean; value: string } {
  switch (oid) {
    case "2.5.29.17": {
      const names = readGeneralNames(raw, expectTag(parseDer(raw), TAG.SEQUENCE, "GeneralNames"));
      const san: CertSan = { dns: [], ip: [], email: [], uri: [], other: [] };
      for (const g of names) san[g.kind].push(g.value);
      out.san = san;
      return { known: true, value: names.map(formatGeneralName).join(", ") || "(empty)" };
    }
    case "2.5.29.19": {
      const seq = expectTag(parseDer(raw), TAG.SEQUENCE, "BasicConstraints");
      let ca = false;
      let pathLen: number | null = null;
      for (const c of seq.children ?? []) {
        if (isUniversal(c, TAG.BOOLEAN)) ca = content(raw, c)[0] !== 0;
        else if (isUniversal(c, TAG.INTEGER)) pathLen = Number(readInteger(content(raw, c)).decimal);
      }
      out.basicConstraints = { ca, pathLen };
      return { known: true, value: `CA:${ca ? "TRUE" : "FALSE"}${pathLen !== null ? `, pathlen:${pathLen}` : ""}` };
    }
    case "2.5.29.15": {
      const bits = readBitString(content(raw, expectTag(parseDer(raw), TAG.BIT_STRING, "KeyUsage")));
      const flags = bitStringFlags(bits, KEY_USAGE_BITS);
      out.keyUsage = flags;
      return { known: true, value: flags.join(", ") || "(none)" };
    }
    case "2.5.29.37": {
      const seq = expectTag(parseDer(raw), TAG.SEQUENCE, "ExtKeyUsage");
      const names = (seq.children ?? []).map((c) => oidName(oidToString(content(raw, expectTag(c, TAG.OID, "KeyPurposeId")))));
      out.extKeyUsage = names;
      return { known: true, value: names.join(", ") || "(none)" };
    }
    case "2.5.29.14": {
      const id = bytesToHex(content(raw, expectTag(parseDer(raw), TAG.OCTET_STRING, "SubjectKeyIdentifier")), ":", true);
      out.subjectKeyId = id;
      return { known: true, value: id };
    }
    case "2.5.29.35": {
      const seq = expectTag(parseDer(raw), TAG.SEQUENCE, "AuthorityKeyIdentifier");
      const parts: string[] = [];
      for (const c of seq.children ?? []) {
        if (isContext(c, 0)) {
          const id = bytesToHex(content(raw, c), ":", true);
          out.authorityKeyId = id;
          parts.push(`keyid:${id}`);
        } else if (isContext(c, 1)) {
          parts.push(...readGeneralNames(raw, c).map(formatGeneralName));
        } else if (isContext(c, 2)) {
          parts.push(`serial:${bytesToHex(content(raw, c), ":", true)}`);
        }
      }
      return { known: true, value: parts.join(", ") || "(empty)" };
    }
    case "2.5.29.31": {
      const seq = expectTag(parseDer(raw), TAG.SEQUENCE, "CRLDistributionPoints");
      const uris: string[] = [];
      for (const dp of seq.children ?? []) {
        for (const c of dp.children ?? []) {
          if (!isContext(c, 0)) continue;
          for (const fullName of c.children ?? []) {
            if (isContext(fullName, 0)) uris.push(...readGeneralNames(raw, fullName).map(formatGeneralName));
          }
        }
      }
      return { known: true, value: uris.join(", ") || "(no full names)" };
    }
    case "1.3.6.1.5.5.7.1.1": {
      const seq = expectTag(parseDer(raw), TAG.SEQUENCE, "AuthorityInfoAccess");
      const parts: string[] = [];
      for (const ad of seq.children ?? []) {
        const [method, location] = ad.children ?? [];
        if (!method || !location) continue;
        parts.push(`${oidName(oidToString(content(raw, method)))} - ${formatGeneralName(readGeneralName(raw, location))}`);
      }
      return { known: true, value: parts.join(", ") || "(empty)" };
    }
    case "2.5.29.32": {
      const seq = expectTag(parseDer(raw), TAG.SEQUENCE, "CertificatePolicies");
      const parts: string[] = [];
      for (const pi of seq.children ?? []) {
        const oidNode = pi.children?.[0];
        if (oidNode && isUniversal(oidNode, TAG.OID)) parts.push(oidName(oidToString(content(raw, oidNode))));
      }
      return { known: true, value: parts.join(", ") || "(empty)" };
    }
    default:
      return { known: false, value: "#" + bytesToHex(raw) };
  }
}

// ---------------------------------------------------------------------------
// Certificate
// ---------------------------------------------------------------------------

function computeStatus(notBefore: Date, notAfter: Date, now: Date): CertStatus {
  const daysRemaining = Math.ceil((notAfter.getTime() - now.getTime()) / DAY_MS);
  if (now.getTime() < notBefore.getTime()) {
    const days = Math.ceil((notBefore.getTime() - now.getTime()) / DAY_MS);
    return { state: "not-yet-valid", daysRemaining, message: `Not valid yet — becomes valid in ${days} day${days === 1 ? "" : "s"}` };
  }
  if (now.getTime() > notAfter.getTime()) {
    const days = Math.max(0, -daysRemaining);
    return { state: "expired", daysRemaining, message: `Expired ${days} day${days === 1 ? "" : "s"} ago` };
  }
  return { state: "valid", daysRemaining, message: `Valid — expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}` };
}

/** Decode an X.509 certificate from DER bytes. */
export function decodeCertificateDer(der: Uint8Array, now: Date = new Date(), chainCount = 1): CertOk | CertError {
  if (der.length > ASN1_MAX_BYTES) return { ok: false, error: "Certificate is larger than 1 MB." };
  try {
    const root = parseDer(der);
    if (!isUniversal(root, TAG.SEQUENCE)) return { ok: false, error: "Not a DER certificate: the outer element is not a SEQUENCE." };
    const [tbs, sigAlgNode] = root.children ?? [];
    expectTag(tbs, TAG.SEQUENCE, "TBSCertificate");
    const fields = tbs.children ?? [];
    let i = 0;
    let version = 1;
    if (fields[0] && isContext(fields[0], 0)) {
      version = Number(readInteger(content(der, expectTag(fields[0].children?.[0], TAG.INTEGER, "version"))).decimal) + 1;
      i = 1;
    }
    const serial = readInteger(content(der, expectTag(fields[i++], TAG.INTEGER, "serialNumber")));
    const tbsAlg = readAlgorithm(der, fields[i++]);
    const issuer = readName(der, fields[i++]);
    const validity = expectTag(fields[i++], TAG.SEQUENCE, "Validity");
    const [nbNode, naNode] = validity.children ?? [];
    if (!nbNode || !naNode) throw new Asn1Error("Validity is missing notBefore or notAfter.");
    const notBefore = readTime(der, nbNode);
    const notAfter = readTime(der, naNode);
    if (!notBefore || !notAfter) throw new Asn1Error("Validity dates could not be parsed.");
    const subject = readName(der, fields[i++]);
    const publicKey = readPublicKey(der, fields[i++]);
    let extNode: Asn1Node | undefined;
    for (; i < fields.length; i++) {
      if (isContext(fields[i], 3)) extNode = fields[i];
    }
    if (version < 3 && extNode) throw new Asn1Error("Extensions are only allowed in v3 certificates.");
    const ext = readExtensions(der, extNode);

    // Prefer the outer signature algorithm; it is the one relying parties check.
    const sigAlg = sigAlgNode ? readAlgorithm(der, sigAlgNode) : tbsAlg;
    const serialHex = bytesToHex(hexToBytes(serial.hex), ":");

    return {
      ok: true,
      der,
      chainCount,
      version,
      serialHex,
      serialDecimal: serial.decimal,
      signatureAlgorithm: oidName(sigAlg.oid),
      signatureAlgorithmOid: sigAlg.oid,
      issuer,
      subject,
      selfSigned: issuer.oneLine === subject.oneLine,
      notBefore,
      notAfter,
      notBeforeIso: notBefore.toISOString(),
      notAfterIso: notAfter.toISOString(),
      validityDays: Math.round((notAfter.getTime() - notBefore.getTime()) / DAY_MS),
      status: computeStatus(notBefore, notAfter, now),
      publicKey,
      extensions: ext.extensions,
      unknownExtensions: ext.extensions.filter((e) => !e.known).map((e) => ({ oid: e.oid, critical: e.critical })),
      san: ext.san,
      basicConstraints: ext.basicConstraints,
      keyUsage: ext.keyUsage,
      extKeyUsage: ext.extKeyUsage,
      subjectKeyId: ext.subjectKeyId,
      authorityKeyId: ext.authorityKeyId,
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown error";
    return { ok: false, error: `Could not decode this certificate: ${detail}` };
  }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Decode a PEM certificate (or a bundle; the first certificate is decoded and
 * `chainCount` reports how many there are). Raw base64 without armour is accepted too.
 */
export function decodeCertificate(pem: string, now: Date = new Date()): CertOk | CertError {
  const source = parseCertificateInput(pem);
  if (!source.ok) return source;
  return decodeCertificateDer(source.der, now, source.chainCount);
}

export type CertSource = { ok: true; der: Uint8Array; chainCount: number } | CertError;

/**
 * Turn pasted text into certificate DER bytes without decoding them, rejecting
 * PEM blocks that are clearly not certificates (CSRs, keys, CRLs).
 */
export function parseCertificateInput(pem: string): CertSource {
  const parsed = pemToDer(pem);
  if (!parsed.ok) return parsed;
  const label = parsed.label;
  if (label && !CERT_LABELS.has(label)) {
    if (label.includes("CERTIFICATE REQUEST")) return { ok: false, error: "This looks like a certificate signing request, not a certificate." };
    if (label.includes("PRIVATE KEY")) {
      return { ok: false, error: "This is a private key, not a certificate. Keep private keys out of tools you have not audited (this one never sends anything, but the habit matters)." };
    }
    if (label.includes("PUBLIC KEY")) return { ok: false, error: "This is a bare public key, not a certificate." };
    if (label.includes("CRL")) return { ok: false, error: "This is a certificate revocation list, not a certificate." };
    return { ok: false, error: `Expected a CERTIFICATE block but found "${label}".` };
  }
  const chainCount = label ? pemBlocks(pem).filter((b) => CERT_LABELS.has(b.label)).length : 1;
  return { ok: true, der: parsed.der, chainCount };
}

/** SHA-1 and SHA-256 fingerprints of the DER, colon-separated uppercase hex (like openssl x509 -fingerprint). */
export async function certificateFingerprints(der: Uint8Array, subtle: SubtleCrypto = crypto.subtle): Promise<{ sha1: string; sha256: string }> {
  // Copy into a fresh buffer: subtle.digest wants an ArrayBuffer-backed view, and `der` may be a subarray.
  const data = new Uint8Array(der);
  const [sha1, sha256] = await Promise.all([subtle.digest("SHA-1", data), subtle.digest("SHA-256", data)]);
  return { sha1: bytesToHex(new Uint8Array(sha1), ":", true), sha256: bytesToHex(new Uint8Array(sha256), ":", true) };
}

/** Self-signed RSA-2048 certificate for devbox.example, valid 2026-09-29 to 2036-09-26. */
export const CERTIFICATE_SAMPLE = `-----BEGIN CERTIFICATE-----
MIIDbDCCAlSgAwIBAgIUBEdkBxFqg8mosDe2j1TK2Z5RKaEwDQYJKoZIhvcNAQEL
BQAwKjEXMBUGA1UEAwwOZGV2Ym94LmV4YW1wbGUxDzANBgNVBAoMBkRldkJveDAe
Fw0yNjA5MjkxNzQ0MjBaFw0zNjA5MjYxNzQ0MjBaMCoxFzAVBgNVBAMMDmRldmJv
eC5leGFtcGxlMQ8wDQYDVQQKDAZEZXZCb3gwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQC/AT3fwTwyQowmjBRIJa5L/ybyZonwY3jbdTCgHOFDEK6ojn9j
DfMyQ7vcl/ORsZ2oGJ8otX8kLRb0ECAqK7GlWMmJBiBVmG2W9hU12KPuywhaDPwC
7kp2plwHjH7uUvFUS/L8tLyIeCFm4sj2Fd6r5LDgmiUbf09H6QyIMcCkZJbUUpRJ
ibLEBHcM6gSRRHYhDGYZCwmZ3ZLnmPK+p8h7oA2G0gvCdbOi8ievV/r0RVBmkaIG
cSKtlBKKdYuVEXDZGb0iwXG1QmCZ/j+ng4KX6pELUj32fjmdrsfpUPQcApOIh+fg
xvNTgzLQcy2VGC50Zq+lVayqz/QjQOP5srVPAgMBAAGjgYkwgYYwHQYDVR0OBBYE
FB6koWNgV+H/aG4a9Qh+JLyOtw1qMB8GA1UdIwQYMBaAFB6koWNgV+H/aG4a9Qh+
JLyOtw1qMA8GA1UdEwEB/wQFMAMBAf8wMwYDVR0RBCwwKoIOZGV2Ym94LmV4YW1w
bGWCEnd3dy5kZXZib3guZXhhbXBsZYcEfwAAATANBgkqhkiG9w0BAQsFAAOCAQEA
fPaho0W9y2N7qYscIZJN76w5kdmTIOn8QIYiLS8vaPKswge7d1S/4vKjztuThIUB
uV5ixu7ZHNW/I7sFlP5IT/i8TH9Fir83L+nfPQSsB2vsoj9BhkqeGNdUkMqShIaj
pyKXJHIBgMOgfWbDT4wVvw2uXi3eDS/c3+iWl2rtT12aYegzwGuRGarghw2msKF/
SeLIwggPfUD4AWv7EyWP8GFCldxpjCsyU2+8lIPeY83yLBAQlRMlWa+h4kR161QK
HDv3zj7pw09kcmrfRjXOqIJEn54PSJMT6dU1fWcAgigg41+LXeK8ZzffzLruuH+o
abon4KXqPAPPhNZC5rVCbA==
-----END CERTIFICATE-----
`;
