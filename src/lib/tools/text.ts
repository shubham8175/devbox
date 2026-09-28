export interface TextStats {
  chars: number;
  charsNoSpaces: number;
  words: number;
  lines: number;
  bytes: number;
  nonEmptyLines: number;
}

export function textStats(text: string): TextStats {
  const lines = text ? text.split(/\r?\n/) : [];
  return {
    chars: Array.from(text).length,
    charsNoSpaces: Array.from(text.replace(/\s/g, "")).length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    lines: text ? lines.length : 0,
    nonEmptyLines: lines.filter((l) => l.trim()).length,
    bytes: new TextEncoder().encode(text).length,
  };
}

const splitLines = (t: string) => t.split(/\r?\n/);
const eol = (t: string) => (/\r\n/.test(t) ? "\r\n" : "\n");
const joinLines = (orig: string, lines: string[]) => lines.join(eol(orig));

export const removeDuplicateLines = (t: string) => joinLines(t, Array.from(new Set(splitLines(t))));
export const sortAZ = (t: string) => joinLines(t, [...splitLines(t)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
export const sortZA = (t: string) => joinLines(t, [...splitLines(t)].sort((a, b) => b.localeCompare(a, undefined, { sensitivity: "base" })));
export const sortNumeric = (t: string) =>
  joinLines(
    t,
    [...splitLines(t)].sort((a, b) => {
      const na = parseFloat(a.replace(/[^\d.-]/g, ""));
      const nb = parseFloat(b.replace(/[^\d.-]/g, ""));
      if (Number.isNaN(na) && Number.isNaN(nb)) return a.localeCompare(b);
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    }),
  );
export const trimLines = (t: string) => joinLines(t, splitLines(t).map((l) => l.trim()));
export const removeEmptyLines = (t: string) => joinLines(t, splitLines(t).filter((l) => l.trim() !== ""));
export const collapseSpaces = (t: string) => joinLines(t, splitLines(t).map((l) => l.replace(/[ \t]{2,}/g, " ")));
export const addPrefix = (t: string, prefix: string) => joinLines(t, splitLines(t).map((l) => prefix + l));
export const addSuffix = (t: string, suffix: string) => joinLines(t, splitLines(t).map((l) => l + suffix));
export const reverseLines = (t: string) => joinLines(t, splitLines(t).reverse());
export const toCRLF = (t: string) => t.replace(/\r?\n/g, "\r\n");
export const toLF = (t: string) => t.replace(/\r\n/g, "\n");

/** Keep only lines that appear exactly once. */
export const uniqueOnlyLines = (t: string) => {
  const lines = splitLines(t);
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  return joinLines(t, lines.filter((l) => counts.get(l) === 1));
};

export function shuffleLines(t: string): string {
  const lines = splitLines(t);
  const rnd = new Uint32Array(lines.length);
  crypto.getRandomValues(rnd);
  for (let i = lines.length - 1; i > 0; i--) {
    const j = rnd[i] % (i + 1);
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  return joinLines(t, lines);
}

export function findReplace(t: string, find: string, replace: string, opts: { regex: boolean; caseSensitive: boolean }): { ok: true; text: string; count: number } | { ok: false; error: string } {
  if (!find) return { ok: true, text: t, count: 0 };
  if (find.length > 2000) return { ok: false, error: "The find pattern is limited to 2,000 characters." };
  let re: RegExp;
  try {
    const flags = "g" + (opts.caseSensitive ? "" : "i");
    re = opts.regex ? new RegExp(find, flags) : new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid regular expression." };
  }
  let count = 0;
  const text = t.replace(re, (...args) => {
    count++;
    if (!opts.regex) return replace;
    // Support $1 etc. by delegating to String.replace semantics
    const m = args[0] as string;
    const groups = args.slice(1, -2) as string[];
    return replace.replace(/\$(\d+|&)/g, (_, g: string) => (g === "&" ? m : (groups[Number(g) - 1] ?? "")));
  });
  return { ok: true, text, count };
}

export const TEXT_SAMPLE = `banana
apple
cherry

apple
  date  
10 items
2 items
banana`;
