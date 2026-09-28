export interface CharInfo {
  index: number;
  char: string;
  cp: number;
  hex: string;
  uPlus: string;
  utf8: string;
  utf8Bytes: number;
  utf16: string;
  utf16Units: number;
  jsEscape: string;
  htmlEntity: string;
  category: string;
}

export interface UnicodeSummary {
  codePoints: number;
  utf16Units: number;
  utf8Bytes: number;
  graphemes: number;
  truncated: boolean;
}

const encoder = new TextEncoder();

function categoryOf(ch: string, cp: number): string {
  if (cp === 0x20) return "Space";
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return "Control";
  try {
    if (/\p{Extended_Pictographic}/u.test(ch)) return "Emoji";
    if (/\p{L}/u.test(ch)) return "Letter";
    if (/\p{N}/u.test(ch)) return "Number";
    if (/\p{P}/u.test(ch)) return "Punctuation";
    if (/\p{S}/u.test(ch)) return "Symbol";
    if (/\p{M}/u.test(ch)) return "Mark (combining)";
    if (/\p{Z}/u.test(ch)) return "Separator";
    if (/\p{Cf}/u.test(ch)) return "Format (invisible)";
  } catch {
    // Unicode property escapes unsupported
  }
  return "Other";
}

export function describeChar(char: string, index: number): CharInfo {
  const cp = char.codePointAt(0)!;
  const hex = cp.toString(16).toUpperCase().padStart(4, "0");
  const bytes = encoder.encode(char);
  const units: string[] = [];
  for (let i = 0; i < char.length; i++) units.push(char.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0"));
  const jsEscape = cp > 0xffff ? `\\u{${cp.toString(16).toUpperCase()}}` : `\\u${hex}`;
  return {
    index,
    char,
    cp,
    hex,
    uPlus: `U+${hex}`,
    utf8: Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" "),
    utf8Bytes: bytes.length,
    utf16: units.join(" "),
    utf16Units: char.length,
    jsEscape,
    htmlEntity: `&#x${hex};`,
    category: categoryOf(char, cp),
  };
}

export const UNICODE_LIMIT = 2000;

export function inspectText(text: string): { chars: CharInfo[]; summary: UnicodeSummary; graphemes: string[] } {
  const chars: CharInfo[] = [];
  let i = 0;
  let count = 0;
  for (const ch of text) {
    if (count < UNICODE_LIMIT) chars.push(describeChar(ch, i));
    i += ch.length;
    count++;
  }
  let graphemes: string[] = [];
  const Seg = (Intl as unknown as { Segmenter?: new (locale: string, opts: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) {
    graphemes = Array.from(new Seg("en", { granularity: "grapheme" }).segment(text), (s) => s.segment);
  } else {
    graphemes = Array.from(text);
  }
  return {
    chars,
    graphemes: graphemes.slice(0, UNICODE_LIMIT),
    summary: { codePoints: count, utf16Units: text.length, utf8Bytes: encoder.encode(text).length, graphemes: graphemes.length, truncated: count > UNICODE_LIMIT },
  };
}

/** Parse "U+1F525", "0x1F525", "1F525" or a literal character into a string. */
export function fromCodePointInput(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = /^(?:U\+|0x|\\u\{?)?([0-9a-f]{1,6})\}?$/i.exec(s);
  if (m && s.length > 1 && !/^[0-9]$/.test(s)) {
    const cp = parseInt(m[1], 16);
    if (cp >= 0 && cp <= 0x10ffff) {
      try {
        return String.fromCodePoint(cp);
      } catch {
        return null;
      }
    }
  }
  return null;
}
