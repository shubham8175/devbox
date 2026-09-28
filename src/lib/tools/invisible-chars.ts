export interface InvisibleDef {
  name: string;
  /** Short display glyph */
  glyph: string;
  /** Normal whitespace (space, tab, newline) that is usually intended */
  benign?: boolean;
  suggestion: string;
}

const C0_NAMES: Record<number, string> = {
  0x00: "NULL", 0x01: "START OF HEADING", 0x02: "START OF TEXT", 0x03: "END OF TEXT", 0x04: "END OF TRANSMISSION", 0x05: "ENQUIRY", 0x06: "ACKNOWLEDGE", 0x07: "BELL", 0x08: "BACKSPACE",
  0x0b: "VERTICAL TAB", 0x0c: "FORM FEED", 0x0e: "SHIFT OUT", 0x0f: "SHIFT IN", 0x10: "DATA LINK ESCAPE", 0x11: "DEVICE CONTROL 1", 0x12: "DEVICE CONTROL 2", 0x13: "DEVICE CONTROL 3", 0x14: "DEVICE CONTROL 4",
  0x15: "NEGATIVE ACKNOWLEDGE", 0x16: "SYNCHRONOUS IDLE", 0x17: "END OF TRANSMISSION BLOCK", 0x18: "CANCEL", 0x19: "END OF MEDIUM", 0x1a: "SUBSTITUTE", 0x1b: "ESCAPE", 0x1c: "FILE SEPARATOR", 0x1d: "GROUP SEPARATOR", 0x1e: "RECORD SEPARATOR", 0x1f: "UNIT SEPARATOR", 0x7f: "DELETE",
};

export const INVISIBLE_TABLE: Record<number, InvisibleDef> = {
  0x20: { name: "SPACE", glyph: "·", benign: true, suggestion: "Normal space." },
  0x09: { name: "CHARACTER TABULATION (tab)", glyph: "→", benign: true, suggestion: "Normal tab. Convert to spaces if the file expects them." },
  0x0a: { name: "LINE FEED (newline)", glyph: "¶", benign: true, suggestion: "Normal newline." },
  0x0d: { name: "CARRIAGE RETURN", glyph: "␍", suggestion: "Windows line ending. Convert CRLF → LF if unexpected." },
  0xa0: { name: "NO-BREAK SPACE", glyph: "⍽", suggestion: "Replace with a normal space. Often pasted from web pages or Word." },
  0xad: { name: "SOFT HYPHEN", glyph: "­⁃", suggestion: "Remove; invisible unless the line wraps there." },
  0x1680: { name: "OGHAM SPACE MARK", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2000: { name: "EN QUAD", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2001: { name: "EM QUAD", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2002: { name: "EN SPACE", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2003: { name: "EM SPACE", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2004: { name: "THREE-PER-EM SPACE", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2005: { name: "FOUR-PER-EM SPACE", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2006: { name: "SIX-PER-EM SPACE", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2007: { name: "FIGURE SPACE", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2008: { name: "PUNCTUATION SPACE", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2009: { name: "THIN SPACE", glyph: "␣", suggestion: "Replace with a normal space." },
  0x200a: { name: "HAIR SPACE", glyph: "␣", suggestion: "Replace with a normal space." },
  0x200b: { name: "ZERO WIDTH SPACE", glyph: "ZWSP", suggestion: "Remove. Breaks string comparisons and identifiers; common in copied code." },
  0x200c: { name: "ZERO WIDTH NON-JOINER", glyph: "ZWNJ", suggestion: "Remove unless the text is in a script that needs it (Persian, Indic)." },
  0x200d: { name: "ZERO WIDTH JOINER", glyph: "ZWJ", suggestion: "Remove unless part of an emoji sequence or a script that needs it." },
  0x200e: { name: "LEFT-TO-RIGHT MARK", glyph: "LRM", suggestion: "Remove unless bidirectional text is intended." },
  0x200f: { name: "RIGHT-TO-LEFT MARK", glyph: "RLM", suggestion: "Remove unless bidirectional text is intended." },
  0x2028: { name: "LINE SEPARATOR", glyph: "LS", suggestion: "Replace with a newline. Breaks JSON in older JavaScript." },
  0x2029: { name: "PARAGRAPH SEPARATOR", glyph: "PS", suggestion: "Replace with a newline." },
  0x202a: { name: "LEFT-TO-RIGHT EMBEDDING", glyph: "LRE", suggestion: "Remove. Bidi controls can disguise code (Trojan Source)." },
  0x202b: { name: "RIGHT-TO-LEFT EMBEDDING", glyph: "RLE", suggestion: "Remove. Bidi controls can disguise code (Trojan Source)." },
  0x202c: { name: "POP DIRECTIONAL FORMATTING", glyph: "PDF", suggestion: "Remove. Bidi controls can disguise code (Trojan Source)." },
  0x202d: { name: "LEFT-TO-RIGHT OVERRIDE", glyph: "LRO", suggestion: "Remove. Bidi controls can disguise code (Trojan Source)." },
  0x202e: { name: "RIGHT-TO-LEFT OVERRIDE", glyph: "RLO", suggestion: "Remove. Bidi controls can disguise code (Trojan Source)." },
  0x202f: { name: "NARROW NO-BREAK SPACE", glyph: "⍽", suggestion: "Replace with a normal space. Common in French typography and macOS dates." },
  0x205f: { name: "MEDIUM MATHEMATICAL SPACE", glyph: "␣", suggestion: "Replace with a normal space." },
  0x2060: { name: "WORD JOINER", glyph: "WJ", suggestion: "Remove." },
  0x2061: { name: "FUNCTION APPLICATION", glyph: "FA", suggestion: "Remove." },
  0x2062: { name: "INVISIBLE TIMES", glyph: "IT", suggestion: "Remove." },
  0x2063: { name: "INVISIBLE SEPARATOR", glyph: "IS", suggestion: "Remove." },
  0x2064: { name: "INVISIBLE PLUS", glyph: "IP", suggestion: "Remove." },
  0x2066: { name: "LEFT-TO-RIGHT ISOLATE", glyph: "LRI", suggestion: "Remove. Bidi controls can disguise code (Trojan Source)." },
  0x2067: { name: "RIGHT-TO-LEFT ISOLATE", glyph: "RLI", suggestion: "Remove. Bidi controls can disguise code (Trojan Source)." },
  0x2068: { name: "FIRST STRONG ISOLATE", glyph: "FSI", suggestion: "Remove. Bidi controls can disguise code (Trojan Source)." },
  0x2069: { name: "POP DIRECTIONAL ISOLATE", glyph: "PDI", suggestion: "Remove. Bidi controls can disguise code (Trojan Source)." },
  0x3000: { name: "IDEOGRAPHIC SPACE", glyph: "␣", suggestion: "Replace with a normal space (full-width space from CJK input)." },
  0xfeff: { name: "ZERO WIDTH NO-BREAK SPACE (BOM)", glyph: "BOM", suggestion: "Remove. A byte-order mark inside text breaks parsers; at position 0 it is a UTF-8 BOM." },
  0xfe0e: { name: "VARIATION SELECTOR-15 (text style)", glyph: "VS15", suggestion: "Usually intentional after an emoji; remove if unexpected." },
  0xfe0f: { name: "VARIATION SELECTOR-16 (emoji style)", glyph: "VS16", suggestion: "Usually intentional after an emoji; remove if unexpected." },
  0x034f: { name: "COMBINING GRAPHEME JOINER", glyph: "CGJ", suggestion: "Remove." },
  0x061c: { name: "ARABIC LETTER MARK", glyph: "ALM", suggestion: "Remove unless Arabic bidi layout is intended." },
  0x180e: { name: "MONGOLIAN VOWEL SEPARATOR", glyph: "MVS", suggestion: "Remove." },
  0xe0001: { name: "LANGUAGE TAG", glyph: "TAG", suggestion: "Remove." },
};

export function describeInvisible(cp: number): InvisibleDef | null {
  const def = INVISIBLE_TABLE[cp];
  if (def) return def;
  if (cp in C0_NAMES) return { name: C0_NAMES[cp], glyph: `^${String.fromCharCode((cp + 64) & 0x7f)}`, suggestion: "Control character. Remove unless the data is binary." };
  if (cp >= 0x80 && cp <= 0x9f) return { name: `C1 CONTROL U+${cp.toString(16).toUpperCase().padStart(4, "0")}`, glyph: "C1", suggestion: "Control character, often from a mis-decoded Windows-1252 file. Remove." };
  if (cp >= 0xe0020 && cp <= 0xe007f) return { name: "TAG CHARACTER", glyph: "TAG", suggestion: "Remove; invisible tag characters can hide text." };
  if (cp >= 0xfe00 && cp <= 0xfe0d) return { name: `VARIATION SELECTOR-${cp - 0xfe00 + 1}`, glyph: "VS", suggestion: "Remove if unexpected." };
  return null;
}

export interface Finding {
  index: number;
  line: number;
  col: number;
  cp: number;
  hex: string;
  name: string;
  glyph: string;
  benign: boolean;
  suggestion: string;
}

export interface ScanResult {
  findings: Finding[];
  /** Findings that are not normal space/tab/newline */
  suspicious: Finding[];
  counts: Map<number, number>;
}

export function scanInvisible(text: string, includeBenign = false): ScanResult {
  const findings: Finding[] = [];
  const counts = new Map<number, number>();
  let line = 1;
  let col = 1;
  let index = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const def = describeInvisible(cp);
    if (def && (includeBenign || !def.benign)) {
      findings.push({ index, line, col, cp, hex: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`, name: def.name, glyph: def.glyph, benign: !!def.benign, suggestion: def.suggestion });
      counts.set(cp, (counts.get(cp) ?? 0) + 1);
    }
    if (cp === 0x0a) {
      line++;
      col = 1;
    } else col++;
    index += ch.length;
  }
  return { findings, suspicious: findings.filter((f) => !f.benign), counts };
}

/** Segments for visualisation: runs of normal text and single invisible chars. */
export function segmentInvisible(text: string): Array<{ text: string; finding: Finding | null }> {
  const out: Array<{ text: string; finding: Finding | null }> = [];
  let buf = "";
  let line = 1;
  let col = 1;
  let index = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const def = describeInvisible(cp);
    if (def) {
      if (buf) out.push({ text: buf, finding: null });
      buf = "";
      out.push({ text: ch, finding: { index, line, col, cp, hex: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`, name: def.name, glyph: def.glyph, benign: !!def.benign, suggestion: def.suggestion } });
    } else buf += ch;
    if (cp === 0x0a) {
      line++;
      col = 1;
    } else col++;
    index += ch.length;
  }
  if (buf) out.push({ text: buf, finding: null });
  return out;
}

/** Remove every invisible character except normal space, tab, LF. Bidi/zero-width are dropped; exotic spaces become a normal space. */
export function removeInvisible(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x20 || cp === 0x09 || cp === 0x0a) {
      out += ch;
      continue;
    }
    if (cp === 0x0d) continue;
    const def = describeInvisible(cp);
    if (!def) {
      out += ch;
      continue;
    }
    if (/SPACE|QUAD/.test(def.name) && !/ZERO WIDTH/.test(def.name)) out += " ";
    else if (cp === 0x2028 || cp === 0x2029) out += "\n";
    // everything else dropped
  }
  return out;
}

/** NBSP-like → space, CRLF → LF, collapse runs of spaces/tabs, trim line ends, remove zero-width. */
export function normalizeWhitespace(text: string): string {
  return removeInvisible(text)
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export const INVISIBLE_SAMPLE = "const api​Key = \"abc 123\";\r\n﻿if (user‍.name === \"admin‮\") {\n\treturn true;\n}";
