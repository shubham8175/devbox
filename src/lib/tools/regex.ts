export const REGEX_FLAGS = [
  { flag: "g", label: "global", description: "Find all matches" },
  { flag: "i", label: "ignore case", description: "Case-insensitive" },
  { flag: "m", label: "multiline", description: "^ and $ match line boundaries" },
  { flag: "s", label: "dotAll", description: ". matches newlines" },
  { flag: "u", label: "unicode", description: "Full Unicode matching" },
] as const;

export interface RegexMatch {
  index: number;
  end: number;
  match: string;
  groups: string[];
  named: Record<string, string | undefined>;
}

export interface RegexResult {
  ok: boolean;
  error?: string;
  matches: RegexMatch[];
  /** Segments of the test string, alternating plain/highlighted, for rendering */
  segments: Array<{ text: string; matchIndex: number | null }>;
}

const MAX_MATCHES = 5000;
/** Longest pattern we will compile; longer patterns are almost always pasted by mistake. */
export const MAX_REGEX_PATTERN = 2000;

export function runRegex(pattern: string, flags: string, text: string): RegexResult {
  if (!pattern) return { ok: true, matches: [], segments: [{ text, matchIndex: null }] };
  if (pattern.length > MAX_REGEX_PATTERN) {
    return { ok: false, error: `Pattern is limited to ${MAX_REGEX_PATTERN} characters.`, matches: [], segments: [{ text, matchIndex: null }] };
  }
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid regular expression.", matches: [], segments: [{ text, matchIndex: null }] };
  }

  const matches: RegexMatch[] = [];
  if (re.global) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && matches.length < MAX_MATCHES) {
      matches.push({
        index: m.index,
        end: m.index + m[0].length,
        match: m[0],
        groups: m.slice(1),
        named: m.groups ? { ...m.groups } : {},
      });
      if (m[0].length === 0) {
        // Avoid an infinite loop on empty matches; with the u flag step over a whole code point.
        const cp = re.unicode ? text.codePointAt(re.lastIndex) : undefined;
        re.lastIndex += cp !== undefined && cp > 0xffff ? 2 : 1;
      }
    }
  } else {
    const m = re.exec(text);
    if (m) {
      matches.push({
        index: m.index,
        end: m.index + m[0].length,
        match: m[0],
        groups: m.slice(1),
        named: m.groups ? { ...m.groups } : {},
      });
    }
  }

  const segments: RegexResult["segments"] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.index > cursor) segments.push({ text: text.slice(cursor, m.index), matchIndex: null });
    if (m.end > m.index) segments.push({ text: text.slice(m.index, m.end), matchIndex: i });
    cursor = Math.max(cursor, m.end);
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor), matchIndex: null });
  if (!segments.length) segments.push({ text, matchIndex: null });

  return { ok: true, matches, segments };
}
