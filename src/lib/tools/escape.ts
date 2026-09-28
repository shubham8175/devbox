export type EscapeMode = "json" | "html" | "url" | "unicode";

export const ESCAPE_MODES: Array<{ id: EscapeMode; label: string; hint: string }> = [
  { id: "json", label: "JSON", hint: 'Quotes, backslashes and control characters → \\" \\\\ \\n' },
  { id: "html", label: "HTML", hint: "< > & \" ' → &lt; &gt; &amp; …" },
  { id: "url", label: "URL", hint: "Percent-encoding for URI components" },
  { id: "unicode", label: "Unicode", hint: "Non-ASCII characters → \\uXXXX" },
];

export interface EscapeResult {
  ok: boolean;
  output: string;
  error?: string;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const HTML_NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  euro: "€",
  pound: "£",
  yen: "¥",
  deg: "°",
  times: "×",
  divide: "÷",
  middot: "·",
  bull: "•",
};

export function escapeText(mode: EscapeMode, input: string): EscapeResult {
  try {
    switch (mode) {
      case "json":
        return { ok: true, output: JSON.stringify(input).slice(1, -1) };
      case "html":
        return { ok: true, output: input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]) };
      case "url":
        return { ok: true, output: encodeURIComponent(input) };
      case "unicode":
        return {
          ok: true,
          output: Array.from(input)
            .map((ch) => {
              const cp = ch.codePointAt(0)!;
              if (cp < 0x80) return ch;
              if (cp > 0xffff) {
                // surrogate pair
                const hi = Math.floor((cp - 0x10000) / 0x400) + 0xd800;
                const lo = ((cp - 0x10000) % 0x400) + 0xdc00;
                return `\\u${hi.toString(16).padStart(4, "0")}\\u${lo.toString(16).padStart(4, "0")}`;
              }
              return `\\u${cp.toString(16).padStart(4, "0")}`;
            })
            .join(""),
        };
    }
  } catch (e) {
    return { ok: false, output: "", error: e instanceof Error ? e.message : "Could not escape." };
  }
}

export function unescapeText(mode: EscapeMode, input: string): EscapeResult {
  try {
    switch (mode) {
      case "json": {
        const parsed: unknown = JSON.parse(`"${input.replace(/(?<!\\)"/g, '\\"')}"`);
        return { ok: true, output: String(parsed) };
      }
      case "html":
        return {
          ok: true,
          output: input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
            if (ent[0] === "#") {
              const code = ent[1].toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
              return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
            }
            return HTML_NAMED[ent.toLowerCase()] ?? m;
          }),
        };
      case "url":
        return { ok: true, output: decodeURIComponent(input.replace(/\+/g, "%20")) };
      case "unicode":
        return {
          ok: true,
          output: input.replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi, (_, brace: string, four: string, two: string) => {
            const code = parseInt(brace ?? four ?? two, 16);
            return String.fromCodePoint(code);
          }),
        };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not unescape.";
    return { ok: false, output: "", error: mode === "url" ? "Malformed percent-encoding." : msg };
  }
}

/** Render whitespace visibly: ¶ for newlines, → for tabs, · for spaces. */
export function visualizeWhitespace(input: string): Array<{ text: string; mark: boolean }> {
  const out: Array<{ text: string; mark: boolean }> = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ text: buf, mark: false });
    buf = "";
  };
  for (const ch of input) {
    if (ch === "\n") {
      flush();
      out.push({ text: "¶\n", mark: true });
    } else if (ch === "\r") {
      flush();
      out.push({ text: "␍", mark: true });
    } else if (ch === "\t") {
      flush();
      out.push({ text: "→   ", mark: true });
    } else if (ch === " ") {
      flush();
      out.push({ text: "·", mark: true });
    } else if (ch === " ") {
      flush();
      out.push({ text: "⍽", mark: true });
    } else buf += ch;
  }
  flush();
  return out;
}
