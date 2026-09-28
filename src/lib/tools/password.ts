export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

const SETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?/~",
};
const AMBIGUOUS = new Set("Il1O0o|`'\"{}[]()<>;:,./\\".split(""));

export function buildCharset(opts: PasswordOptions): string {
  let chars = "";
  if (opts.uppercase) chars += SETS.uppercase;
  if (opts.lowercase) chars += SETS.lowercase;
  if (opts.numbers) chars += SETS.numbers;
  if (opts.symbols) chars += SETS.symbols;
  if (opts.excludeAmbiguous) chars = Array.from(chars).filter((c) => !AMBIGUOUS.has(c)).join("");
  return chars;
}

function randomIndexes(count: number, range: number): number[] {
  const out: number[] = [];
  const max = 256 - (256 % range);
  const buf = new Uint8Array(count * 2);
  while (out.length < count) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < count; i++) {
      if (buf[i] < max) out.push(buf[i] % range);
    }
  }
  return out;
}

/** Cryptographically secure password; guarantees at least one char from each selected set when length allows. */
export function generatePassword(opts: PasswordOptions): string {
  const charset = buildCharset(opts);
  const length = Math.max(4, Math.min(128, Math.floor(opts.length)));
  if (!charset) return "";
  const required: string[] = [];
  const groups = (["uppercase", "lowercase", "numbers", "symbols"] as const).filter((g) => opts[g]);
  for (const g of groups) {
    const set = opts.excludeAmbiguous ? Array.from(SETS[g]).filter((c) => !AMBIGUOUS.has(c)).join("") : SETS[g];
    if (set) required.push(set[randomIndexes(1, set.length)[0]]);
  }
  const rest = randomIndexes(Math.max(0, length - required.length), charset.length).map((i) => charset[i]);
  const all = [...required, ...rest].slice(0, length);
  // Fisher–Yates with crypto randomness
  for (let i = all.length - 1; i > 0; i--) {
    const j = randomIndexes(1, i + 1)[0];
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join("");
}

export function entropyBits(length: number, charsetSize: number): number {
  if (!charsetSize || !length) return 0;
  return Math.round(length * Math.log2(charsetSize) * 10) / 10;
}
