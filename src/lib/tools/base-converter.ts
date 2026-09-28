export type Base = 2 | 8 | 10 | 16;

export const BASES: Array<{ base: Base; id: string; label: string; prefix: string }> = [
  { base: 2, id: "binary", label: "Binary", prefix: "0b" },
  { base: 8, id: "octal", label: "Octal", prefix: "0o" },
  { base: 10, id: "decimal", label: "Decimal", prefix: "" },
  { base: 16, id: "hex", label: "Hexadecimal", prefix: "0x" },
];

const CHARSETS: Record<Base, RegExp> = {
  2: /^[01]+$/,
  8: /^[0-7]+$/,
  10: /^[0-9]+$/,
  16: /^[0-9a-f]+$/i,
};

/** Parse a non-negative integer in the given base. Accepts optional prefix, underscores and spaces. */
export function parseInBase(raw: string, base: Base): { ok: true; value: bigint } | { ok: false; error: string } {
  let s = raw.trim().replace(/[\s_]/g, "");
  if (!s) return { ok: false, error: "Empty" };
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  const prefix = BASES.find((b) => b.base === base)!.prefix;
  if (prefix && s.toLowerCase().startsWith(prefix)) s = s.slice(prefix.length);
  if (!CHARSETS[base].test(s)) {
    const label = BASES.find((b) => b.base === base)!.label.toLowerCase();
    return { ok: false, error: `Not a valid ${label} number.` };
  }
  if (s.length > MAX_DIGITS) return { ok: false, error: `Numbers are limited to ${MAX_DIGITS.toLocaleString()} digits.` };
  const nativePrefix = base === 2 ? "0b" : base === 8 ? "0o" : base === 16 ? "0x" : "";
  const value = BigInt(nativePrefix + s.toLowerCase());
  return { ok: true, value: negative ? -value : value };
}

/** Longest digit string we convert; BigInt work above this is quadratic and freezes the tab. */
const MAX_DIGITS = 4096;

export function formatInBase(value: bigint, base: Base): string {
  const neg = value < BigInt(0);
  const s = (neg ? -value : value).toString(base).toUpperCase();
  return (neg ? "-" : "") + (base === 16 ? s : s);
}

/** Group digits from the right, e.g. binary in nibbles, hex in pairs, decimal in thousands. */
export function groupDigits(s: string, size: number, sep = " "): string {
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const out: string[] = [];
  for (let i = body.length; i > 0; i -= size) out.push(body.slice(Math.max(0, i - size), i));
  out.reverse();
  return (neg ? "-" : "") + out.join(sep);
}

export function bitLength(value: bigint): number {
  const abs = value < BigInt(0) ? -value : value;
  return abs === BigInt(0) ? 1 : abs.toString(2).length;
}

export type BitWidth = 8 | 16 | 32 | 64;

/** Interpret the low `width` bits of value as a two's-complement signed integer. */
export function toSigned(value: bigint, width: BitWidth): bigint {
  const mod = BigInt(1) << BigInt(width);
  const v = ((value % mod) + mod) % mod;
  return v >= mod >> BigInt(1) ? v - mod : v;
}

/** Wrap value into the unsigned range of `width` bits. */
export function toUnsigned(value: bigint, width: BitWidth): bigint {
  const mod = BigInt(1) << BigInt(width);
  return ((value % mod) + mod) % mod;
}

export function fitsIn(value: bigint, width: BitWidth): boolean {
  return value >= BigInt(0) && value < BigInt(1) << BigInt(width);
}
