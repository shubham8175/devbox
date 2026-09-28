export interface SlugOptions {
  separator: string;
  lowercase: boolean;
  removeAccents: boolean;
  preserveNumbers: boolean;
  maxLength: number;
}

export const DEFAULT_SLUG_OPTIONS: SlugOptions = { separator: "-", lowercase: true, removeAccents: true, preserveNumbers: true, maxLength: 0 };

const TRANSLITERATE: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", ß: "ss", Ä: "Ae", Ö: "Oe", Ü: "Ue",
  æ: "ae", Æ: "Ae", ø: "o", Ø: "O", å: "a", Å: "A", œ: "oe", Œ: "Oe",
  ð: "d", Ð: "D", þ: "th", Þ: "Th", ł: "l", Ł: "L", đ: "d", Đ: "D", ı: "i", ħ: "h", Ħ: "H",
  "€": "euro", "£": "pound", "$": "dollar", "&": "and", "@": "at", "%": "percent", "+": "plus",
  "©": "c", "®": "r", "™": "tm",
};

export function removeAccents(text: string): string {
  return Array.from(text)
    .map((ch) => TRANSLITERATE[ch] ?? ch)
    .join("")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function slugify(text: string, opts: SlugOptions = DEFAULT_SLUG_OPTIONS): string {
  let s = text.trim();
  if (opts.removeAccents) s = removeAccents(s);
  else s = s.replace(/[&@%+$€£]/g, (c) => ` ${TRANSLITERATE[c] ?? ""} `);
  // camelCase → camel Case so boundaries become separators (before lowercasing)
  s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  if (opts.lowercase) s = s.toLowerCase();
  const allowed = opts.preserveNumbers ? "\\p{L}\\p{N}" : "\\p{L}";
  s = s.replace(new RegExp(`[^${allowed}]+`, "gu"), " ");
  if (!opts.preserveNumbers) s = s.replace(/\p{N}+/gu, " ");
  const sep = opts.separator;
  s = s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(sep);
  if (opts.maxLength > 0 && s.length > opts.maxLength) {
    s = s.slice(0, opts.maxLength);
    if (sep) {
      const cut = s.lastIndexOf(sep);
      if (cut > 0) s = s.slice(0, cut);
    }
  }
  return s;
}

export const SLUG_EXAMPLES = ["Hello World 2026", "Crème Brûlée & Café au Lait", "  Next.js 16 — What's New?  ", "Straße München Über", "camelCaseTitleHere", "日本語 タイトル test"];
