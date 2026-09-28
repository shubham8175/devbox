import { toUnsigned, type BitWidth } from "@/lib/tools/base-converter";

export type { BitWidth };
export const BIT_WIDTHS: BitWidth[] = [8, 16, 32, 64];

/** Auto-detect 0x / 0b / 0o prefixes; plain digits are decimal. Negative allowed (wrapped to width). */
export function parseNumber(raw: string): { ok: true; value: bigint } | { ok: false; error: string } {
  let s = raw.trim().replace(/[\s_]/g, "");
  if (!s) return { ok: false, error: "Enter a number (decimal, 0x hex, 0b binary or 0o octal)." };
  let neg = false;
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  let value: bigint;
  if (s.length > 256) return { ok: false, error: "Numbers are limited to 256 characters." };
  try {
    if (/^0x[0-9a-f]+$/i.test(s) || /^0b[01]+$/i.test(s) || /^0o[0-7]+$/i.test(s)) value = BigInt(s.toLowerCase());
    else if (/^\d+$/.test(s)) value = BigInt(s);
    else if (/^[0-9a-f]+$/i.test(s) && /[a-f]/i.test(s)) value = BigInt(`0x${s}`);
    else return { ok: false, error: `“${raw.trim()}” is not a recognised number.` };
  } catch {
    return { ok: false, error: "Could not parse number." };
  }
  return { ok: true, value: neg ? -value : value };
}

export interface BitResult {
  label: string;
  expression: string;
  value: bigint;
}

export function toBinary(value: bigint, width: BitWidth): string {
  return toUnsigned(value, width).toString(2).padStart(width, "0");
}

export function groupBits(bin: string, size = 4): string {
  const out: string[] = [];
  for (let i = bin.length; i > 0; i -= size) out.unshift(bin.slice(Math.max(0, i - size), i));
  return out.join(" ");
}

export function toHex(value: bigint, width: BitWidth): string {
  return `0x${toUnsigned(value, width).toString(16).toUpperCase().padStart(width / 4, "0")}`;
}

export function computeAll(a: bigint, b: bigint, shift: number, width: BitWidth): BitResult[] {
  const A = toUnsigned(a, width);
  const B = toUnsigned(b, width);
  const mask = (BigInt(1) << BigInt(width)) - BigInt(1);
  const n = BigInt(Math.max(0, Math.min(width, shift)));
  return [
    { label: "AND", expression: "A & B", value: A & B },
    { label: "OR", expression: "A | B", value: A | B },
    { label: "XOR", expression: "A ^ B", value: A ^ B },
    { label: "NOT A", expression: "~A", value: ~A & mask },
    { label: "NOT B", expression: "~B", value: ~B & mask },
    { label: "Left shift", expression: `A << ${shift}`, value: (A << n) & mask },
    { label: "Right shift", expression: `A >> ${shift}`, value: A >> n },
    { label: "Unsigned right shift", expression: `A >>> ${shift}`, value: A >> n },
  ];
}
