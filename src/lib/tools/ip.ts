/** IPv4 helpers using unsigned 32-bit arithmetic. */

export const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseIPv4(raw: string): number | null {
  const m = IPV4_RE.exec(raw.trim());
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const o = Number(m[i]);
    if (o > 255 || (m[i].length > 1 && m[i].startsWith("0"))) return null;
    n = ((n << 8) | o) >>> 0;
  }
  return n >>> 0;
}

export function ipToString(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function ipToBinary(n: number, sep = "."): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].map((o) => o.toString(2).padStart(8, "0")).join(sep);
}

export function ipToHex(n: number): string {
  return `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function ipToOctal(n: number): string {
  return `0${(n >>> 0).toString(8)}`;
}

export function maskFromPrefix(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixFromMask(mask: number): number | null {
  // Valid masks are contiguous 1s followed by 0s
  const inv = (~mask) >>> 0;
  if (((inv + 1) & inv) !== 0) return null;
  let p = 0;
  for (let i = 31; i >= 0; i--) if ((mask >>> i) & 1) p++; else break;
  return p;
}

export function ipClass(n: number): string {
  const first = n >>> 24;
  if (first < 128) return "A";
  if (first < 192) return "B";
  if (first < 224) return "C";
  if (first < 240) return "D (multicast)";
  return "E (reserved)";
}

const SPECIAL: Array<{ cidr: string; label: string }> = [
  { cidr: "10.0.0.0/8", label: "Private (RFC 1918)" },
  { cidr: "172.16.0.0/12", label: "Private (RFC 1918)" },
  { cidr: "192.168.0.0/16", label: "Private (RFC 1918)" },
  { cidr: "127.0.0.0/8", label: "Loopback" },
  { cidr: "169.254.0.0/16", label: "Link-local (APIPA)" },
  { cidr: "100.64.0.0/10", label: "Carrier-grade NAT (RFC 6598)" },
  { cidr: "0.0.0.0/8", label: "This network" },
  { cidr: "224.0.0.0/4", label: "Multicast" },
  { cidr: "240.0.0.0/4", label: "Reserved" },
  { cidr: "255.255.255.255/32", label: "Limited broadcast" },
];

export function describeSpecial(n: number): string | null {
  for (const s of SPECIAL) {
    const [ip, p] = s.cidr.split("/");
    const base = parseIPv4(ip)!;
    const mask = maskFromPrefix(Number(p));
    if (((n & mask) >>> 0) === ((base & mask) >>> 0)) return s.label;
  }
  return null;
}

export interface CidrInfo {
  input: string;
  address: string;
  prefix: number;
  mask: string;
  maskHex: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  usableHosts: number;
  totalAddresses: number;
  ipClass: string;
  special: string | null;
  addressBinary: string;
  maskBinary: string;
  networkInt: number;
  broadcastInt: number;
}

/** Accepts "a.b.c.d/n", "a.b.c.d n", "a.b.c.d 255.255.255.0" or "a.b.c.d/255.255.255.0". */
export function parseCidr(raw: string): { ok: true; value: CidrInfo } | { ok: false; error: string } {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Enter an address like 192.168.1.10/24." };
  const m = /^([^\s/]+)(?:\s*[/\s]\s*(\S+))?$/.exec(input);
  if (!m) return { ok: false, error: "Could not read that input." };
  const addr = parseIPv4(m[1]);
  if (addr === null) return { ok: false, error: `“${m[1]}” is not a valid IPv4 address (four octets 0–255). IPv6 is not supported.` };
  let prefix = 32;
  if (m[2] !== undefined) {
    if (/^\d{1,2}$/.test(m[2])) {
      prefix = Number(m[2]);
      if (prefix > 32) return { ok: false, error: "Prefix length must be between 0 and 32." };
    } else {
      const maskN = parseIPv4(m[2]);
      if (maskN === null) return { ok: false, error: `“${m[2]}” is neither a prefix length nor a dotted mask.` };
      const p = prefixFromMask(maskN);
      if (p === null) return { ok: false, error: `${m[2]} is not a valid contiguous subnet mask.` };
      prefix = p;
    }
  }
  const mask = maskFromPrefix(prefix);
  const network = (addr & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);
  let usable: number;
  let first: number;
  let last: number;
  if (prefix === 32) {
    usable = 1;
    first = last = network;
  } else if (prefix === 31) {
    usable = 2; // RFC 3021 point-to-point
    first = network;
    last = broadcast;
  } else {
    usable = total - 2;
    first = (network + 1) >>> 0;
    last = (broadcast - 1) >>> 0;
  }
  return {
    ok: true,
    value: {
      input,
      address: ipToString(addr),
      prefix,
      mask: ipToString(mask),
      maskHex: ipToHex(mask),
      wildcard: ipToString(~mask >>> 0),
      network: ipToString(network),
      broadcast: ipToString(broadcast),
      firstHost: ipToString(first),
      lastHost: ipToString(last),
      usableHosts: usable,
      totalAddresses: total,
      ipClass: ipClass(addr),
      special: describeSpecial(addr),
      addressBinary: ipToBinary(addr),
      maskBinary: ipToBinary(mask),
      networkInt: network,
      broadcastInt: broadcast,
    },
  };
}

export function ipInRange(ip: string, info: CidrInfo): boolean | null {
  const n = parseIPv4(ip);
  if (n === null) return null;
  return n >= info.networkInt && n <= info.broadcastInt;
}

// ---------- IP ↔ integer ----------

export interface IpForms {
  dotted: string;
  integer: string;
  hex: string;
  binary: string;
  octal: string;
  bits: string;
}

export function ipForms(n: number): IpForms {
  return {
    dotted: ipToString(n),
    integer: String(n >>> 0),
    hex: ipToHex(n),
    binary: ipToBinary(n),
    octal: ipToOctal(n),
    bits: (n >>> 0).toString(2).padStart(32, "0"),
  };
}

/** Accepts a dotted IPv4, a decimal integer, 0x hex, or 0b binary. */
export function parseIpAny(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) return { ok: false, error: "Enter an IPv4 address or an integer." };
  if (s.includes(".")) {
    const n = parseIPv4(s);
    if (n === null) {
      const parts = s.split(".");
      if (parts.length !== 4) return { ok: false, error: `Expected exactly 4 octets, got ${parts.length}.` };
      return { ok: false, error: "Each octet must be a number from 0 to 255 without leading zeros." };
    }
    return { ok: true, value: n };
  }
  let big: bigint;
  if (s.length > 64) return { ok: false, error: "That number is too long to be an address." };
  try {
    if (/^0x[0-9a-f]+$/i.test(s)) big = BigInt(s);
    else if (/^0b[01]+$/i.test(s)) big = BigInt(s);
    else if (/^\d+$/.test(s)) big = BigInt(s);
    else return { ok: false, error: "Enter a dotted address, a decimal integer, 0x hex or 0b binary." };
  } catch {
    return { ok: false, error: "Could not parse number." };
  }
  if (big < BigInt(0) || big > BigInt(4294967295)) return { ok: false, error: "Integer must be between 0 and 4294967295 (2³² − 1)." };
  return { ok: true, value: Number(big) >>> 0 };
}
