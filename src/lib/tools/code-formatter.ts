/**
 * Formatting via Prettier standalone (passed in as `PrettierLike` so the UI can
 * lazy-load it and only the plugins a language needs) plus dependency-free,
 * conservative minifiers that never touch strings, `url()` or `<pre>` contents.
 */

export type FormatterLanguageId = "html" | "css" | "scss" | "less" | "javascript" | "typescript" | "jsx" | "tsx" | "json" | "markdown" | "yaml" | "graphql" | "vue";

export interface FormatterLanguage {
  id: FormatterLanguageId;
  label: string;
  parser: string;
  /** Prettier plugin module ids to load for this language. */
  plugins: string[];
  extension: string;
  /** Whether `minifyCode` supports it. */
  minify: boolean;
}

const JS = ["prettier/plugins/babel", "prettier/plugins/estree"];
const TS = ["prettier/plugins/typescript", "prettier/plugins/estree"];
// The HTML printer formats embedded <script>/<style> blocks when those parsers are present.
const HTML = ["prettier/plugins/html", "prettier/plugins/postcss", ...JS];

export const FORMATTER_LANGUAGES: FormatterLanguage[] = [
  { id: "html", label: "HTML", parser: "html", plugins: HTML, extension: "html", minify: true },
  { id: "css", label: "CSS", parser: "css", plugins: ["prettier/plugins/postcss"], extension: "css", minify: true },
  { id: "scss", label: "SCSS", parser: "scss", plugins: ["prettier/plugins/postcss"], extension: "scss", minify: true },
  { id: "less", label: "Less", parser: "less", plugins: ["prettier/plugins/postcss"], extension: "less", minify: true },
  { id: "javascript", label: "JavaScript", parser: "babel", plugins: JS, extension: "js", minify: true },
  { id: "typescript", label: "TypeScript", parser: "typescript", plugins: TS, extension: "ts", minify: true },
  { id: "jsx", label: "JSX", parser: "babel", plugins: JS, extension: "jsx", minify: true },
  { id: "tsx", label: "TSX", parser: "typescript", plugins: TS, extension: "tsx", minify: true },
  { id: "json", label: "JSON", parser: "json", plugins: JS, extension: "json", minify: true },
  { id: "markdown", label: "Markdown", parser: "markdown", plugins: ["prettier/plugins/markdown"], extension: "md", minify: false },
  { id: "yaml", label: "YAML", parser: "yaml", plugins: ["prettier/plugins/yaml"], extension: "yaml", minify: false },
  { id: "graphql", label: "GraphQL", parser: "graphql", plugins: ["prettier/plugins/graphql"], extension: "graphql", minify: false },
  { id: "vue", label: "Vue SFC", parser: "vue", plugins: HTML, extension: "vue", minify: false },
];

export function getFormatterLanguage(id: FormatterLanguageId): FormatterLanguage {
  return FORMATTER_LANGUAGES.find((l) => l.id === id) ?? FORMATTER_LANGUAGES[0];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Only the first part of a document is inspected; that is plenty for a guess. */
const DETECT_WINDOW = 20_000;

export function detectLanguage(text: string): FormatterLanguageId | null {
  const src = text.slice(0, DETECT_WINDOW);
  const trimmed = src.trimStart();
  if (!trimmed) return null;

  if (/^[[{]/.test(trimmed)) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      // fall through: could be JS/CSS
    }
  }
  if (/^<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(src)) return "html";
  if (/^<template[\s>]/i.test(trimmed) && /<script[\s>]/i.test(src)) return "vue";
  if (/^\s*(query|mutation|subscription|fragment|schema|scalar|directive)\b/m.test(src) && /\{/.test(src)) return "graphql";
  if (/^\s*(type|input|enum|interface|union)\s+[A-Za-z_]\w*\s*(implements\s+[\w&\s]+)?\s*(=|\{)/m.test(src) && !/[;=]\s*>|=>|function|const |import /.test(src)) return "graphql";

  // A document that opens with a tag and closes one is HTML (JSX files open with import/export or a function).
  if (/^<[a-zA-Z][\w-]*[\s>/]/.test(trimmed) && /<\/[a-zA-Z][\w-]*>|\/>/.test(src) && !/^\s*(import|export|const|function)\b/m.test(src)) return "html";

  const hasJsx = /<[A-Z][\w.]*[\s/>]|<\/[a-z][\w-]*>\s*[);]|<>[\s\S]*<\/>/.test(src) && /return\s*\(|=>\s*\(|=>\s*</.test(src);
  const tsSignals = /:\s*(string|number|boolean|unknown|any|void|never)\b|^\s*(export\s+)?(interface|type)\s+[A-Z]\w*\s*[<={]|\bas\s+const\b|<[A-Z]\w*(,\s*[A-Z]\w*)*>\(|\bimplements\b|\benum\s+[A-Z]/m.test(src);
  const jsSignals = /^\s*(import|export)\s|\b(const|let|var|function|return|async|await)\b|\bclass\s+[A-Za-z_$]|=>|console\.|require\(/m.test(src);
  if (jsSignals || tsSignals) {
    if (tsSignals) return hasJsx ? "tsx" : "typescript";
    return hasJsx ? "jsx" : "javascript";
  }

  // A selector-ish prefix followed by a block that contains `property: value`.
  const cssBlock = /(?:^|[\s{}])(?:[.#*:@[]?[a-zA-Z]|&)[^{};]{0,200}\{\s*[^{}]*?[a-zA-Z-]+\s*:\s*[^{};]+;?\s*[^{}]*\}/.test(src) || /^\s*@(import|charset|use|forward)\s/m.test(src);
  if (cssBlock) {
    if (/\$[\w-]+\s*:|@(mixin|include|extend|use|forward)\b|&[\s.:-]|@if\b|@each\b/.test(src)) return "scss";
    if (/@[\w-]+\s*:|\.[\w-]+\(\)\s*;|\.mixin\(|\b(darken|lighten)\(/.test(src)) return "less";
    return "css";
  }

  if (/^---\s*$/m.test(src) || (/^[\w.-]+:\s*(\S|$)/m.test(src) && !/[{};]/.test(src) && /^\s*-\s|\n[\w.-]+:\s/.test(src))) return "yaml";
  if (/^#{1,6}\s\S/m.test(src) || /\*\*[^*\n]+\*\*/.test(src) || /^\s*[-*]\s+\[[ xX]\]\s/m.test(src) || /^\s*[-*]\s+\S/m.test(src) || /^```/m.test(src)) return "markdown";
  return null;
}

// ---------------------------------------------------------------------------
// Formatting (Prettier)
// ---------------------------------------------------------------------------

export interface FormatOptions {
  printWidth: number;
  tabWidth: number;
  useTabs: boolean;
  semi: boolean;
  singleQuote: boolean;
  trailingComma: "all" | "es5" | "none";
  bracketSameLine: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  bracketSameLine: false,
};

/** The loaded Prettier standalone `format` function plus the plugin modules already imported for the language. */
export interface PrettierLike {
  format: (source: string, options: Record<string, unknown>) => Promise<string>;
  plugins: unknown[];
}

export type FormatCodeResult = { ok: true; output: string } | { ok: false; error: string };

/** Formatter inputs above this size are refused to keep the tab responsive (Prettier is synchronous under the hood). */
export const MAX_FORMAT_INPUT = 500_000;

function describeFormatError(e: unknown): string {
  if (!(e instanceof Error)) return "Prettier could not format this input.";
  const first = e.message.split("\n")[0].trim() || "Prettier could not format this input.";
  const loc = (e as { loc?: { start?: { line?: number; column?: number } } }).loc?.start;
  if (loc && typeof loc.line === "number" && !/\(\d+:\d+\)/.test(first)) {
    return `${first} (line ${loc.line}${typeof loc.column === "number" ? `, column ${loc.column}` : ""})`;
  }
  return first;
}

export async function formatCode(prettier: PrettierLike, text: string, language: FormatterLanguageId, options: FormatOptions = DEFAULT_FORMAT_OPTIONS): Promise<FormatCodeResult> {
  if (!text.trim()) return { ok: false, error: "Input is empty." };
  if (text.length > MAX_FORMAT_INPUT) return { ok: false, error: `Input is ${text.length.toLocaleString()} characters; the formatter limit is ${MAX_FORMAT_INPUT.toLocaleString()}.` };
  const lang = getFormatterLanguage(language);
  try {
    const output = await prettier.format(text, {
      parser: lang.parser,
      plugins: prettier.plugins,
      printWidth: Math.min(Math.max(Math.floor(options.printWidth) || 80, 20), 400),
      tabWidth: Math.min(Math.max(Math.floor(options.tabWidth) || 2, 1), 8),
      useTabs: options.useTabs,
      semi: options.semi,
      singleQuote: options.singleQuote,
      trailingComma: options.trailingComma,
      bracketSameLine: options.bracketSameLine,
    });
    return { ok: true, output };
  } catch (e) {
    return { ok: false, error: describeFormatError(e) };
  }
}

// ---------------------------------------------------------------------------
// Minification (dependency-free, conservative)
// ---------------------------------------------------------------------------

export type MinifyResult = { ok: true; output: string } | { ok: false; error: string };

/** Copy a quoted string starting at `i` (the quote) verbatim; returns the index after the closing quote. */
function copyQuoted(src: string, i: number, out: string[]): number {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") {
      j += 2;
      continue;
    }
    if (ch === quote) {
      j++;
      break;
    }
    if (ch === "\n" && quote !== "`") break; // unterminated: stop at the line end
    j++;
  }
  out.push(src.slice(i, j));
  return j;
}

/** CSS/SCSS/Less: strip comments and collapse whitespace outside strings and url(). */
function minifyCss(src: string, lineComments: boolean): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      i = copyQuoted(src, i, out);
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      out.push(" ");
      continue;
    }
    if (lineComments && ch === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }
    if ((ch === "u" || ch === "U") && /^url\(/i.test(src.slice(i, i + 4)) && !/[\w-]/.test(src[i - 1] ?? "")) {
      out.push("url(");
      // Copy the url() argument verbatim (quoted or bare) up to the closing paren.
      let j = i + 4;
      while (j < n && src[j] !== ")") {
        if (src[j] === '"' || src[j] === "'") {
          const tmp: string[] = [];
          j = copyQuoted(src, j, tmp);
          out.push(tmp[0]);
        } else {
          out.push(src[j]);
          j++;
        }
      }
      i = j;
      continue;
    }
    if (/\s/.test(ch)) {
      let j = i;
      while (j < n && /\s/.test(src[j])) j++;
      const prev = out.length ? out[out.length - 1].slice(-1) : "";
      const next = src[j] ?? "";
      // Drop whitespace next to structural punctuation; otherwise collapse to one space.
      if (!prev || !next || "{};:,>".includes(prev) || "{};:,>".includes(next)) {
        // keep nothing
      } else {
        out.push(" ");
      }
      i = j;
      continue;
    }
    // Drop the last semicolon before a closing brace (string tokens are pushed whole, so ";" here is always structural).
    if (ch === "}" && out[out.length - 1] === ";") out.pop();
    out.push(ch);
    i++;
  }
  return out.join("").trim();
}

const HTML_VERBATIM = ["pre", "textarea", "script", "style"];

/** HTML: strip comments and collapse inter-tag whitespace; keeps <pre>/<textarea>/<script>/<style> and attribute values intact. */
function minifyHtml(src: string): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (src[i] === "<") {
      const m = /^<([a-zA-Z][\w-]*)/.exec(src.slice(i, i + 32));
      const tag = m ? m[1].toLowerCase() : "";
      // Copy the opening tag, collapsing whitespace between attributes but never inside quoted values.
      let j = i;
      const tagOut: string[] = [];
      while (j < n && src[j] !== ">") {
        const ch = src[j];
        if (ch === '"' || ch === "'") {
          j = copyQuoted(src, j, tagOut);
          continue;
        }
        if (/\s/.test(ch)) {
          while (j < n && /\s/.test(src[j])) j++;
          if (src[j] !== ">" && src[j] !== "/" && src[j] !== "=" && tagOut[tagOut.length - 1] !== "=") tagOut.push(" ");
          continue;
        }
        tagOut.push(ch);
        j++;
      }
      out.push(tagOut.join("") + (j < n ? ">" : ""));
      i = j + 1;
      if (tag && HTML_VERBATIM.includes(tag)) {
        const close = new RegExp(`</${tag}\\s*>`, "i");
        const rest = src.slice(i);
        const cm = close.exec(rest);
        const end = cm ? i + cm.index + cm[0].length : n;
        out.push(src.slice(i, end));
        i = end;
      }
      continue;
    }
    if (/\s/.test(src[i])) {
      let j = i;
      let hasNewline = false;
      while (j < n && /\s/.test(src[j])) {
        if (src[j] === "\n") hasNewline = true;
        j++;
      }
      const prev = out.length ? out[out.length - 1].slice(-1) : "";
      const next = src[j] ?? "";
      // Whitespace containing a newline between two tags is layout-only; a run without a newline may be meaningful (inline elements).
      if (prev === ">" && next === "<" && hasNewline) {
        // drop
      } else if (!prev || !next) {
        // leading/trailing
      } else {
        out.push(" ");
      }
      i = j;
      continue;
    }
    out.push(src[i]);
    i++;
  }
  return out.join("").trim();
}

const REGEX_PRECEDERS = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);
const REGEX_KEYWORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

/**
 * JavaScript/TypeScript: remove comments, blank lines and leading indentation.
 * Strings, template literals and regex literals are copied verbatim, so their
 * contents (including newlines inside templates) are preserved. This is
 * whitespace/comment removal only, not a real minifier.
 */
function minifyJs(src: string): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  let atLineStart = true;
  let lastSignificant = ""; // last non-space token text, for the regex-vs-division heuristic
  let lastWord = "";

  const endsLine = () => {
    // Trim trailing spaces on the current output line and avoid consecutive blank lines.
    while (out.length && (out[out.length - 1] === " " || out[out.length - 1] === "\t")) out.pop();
    if (out.length && out[out.length - 1] !== "\n") out.push("\n");
    atLineStart = true;
  };

  while (i < n) {
    const ch = src[i];
    if (ch === "\n") {
      endsLine();
      i++;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      if (!atLineStart) out.push(" ");
      i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      if (!atLineStart) out.push(" ");
      continue;
    }
    atLineStart = false;
    if (ch === '"' || ch === "'" || ch === "`") {
      if (ch === "`") {
        // Template literal: copy verbatim, including ${...} expressions (nested braces tracked loosely).
        let j = i + 1;
        let depth = 0;
        while (j < n) {
          const c = src[j];
          if (c === "\\") {
            j += 2;
            continue;
          }
          if (depth === 0 && c === "`") {
            j++;
            break;
          }
          if (c === "$" && src[j + 1] === "{") {
            depth++;
            j += 2;
            continue;
          }
          if (depth > 0 && c === "}") depth--;
          j++;
        }
        out.push(src.slice(i, j));
        i = j;
      } else {
        i = copyQuoted(src, i, out);
      }
      lastSignificant = '"';
      lastWord = "";
      continue;
    }
    if (ch === "/") {
      const regexAllowed = !lastSignificant || REGEX_PRECEDERS.has(lastSignificant) || REGEX_KEYWORDS.has(lastWord);
      if (regexAllowed) {
        let j = i + 1;
        let inClass = false;
        let ok = false;
        while (j < n) {
          const c = src[j];
          if (c === "\n") break;
          if (c === "\\") {
            j += 2;
            continue;
          }
          if (c === "[") inClass = true;
          else if (c === "]") inClass = false;
          else if (c === "/" && !inClass) {
            j++;
            while (j < n && /[a-z]/i.test(src[j])) j++;
            ok = true;
            break;
          }
          j++;
        }
        if (ok) {
          out.push(src.slice(i, j));
          i = j;
          lastSignificant = ")";
          lastWord = "";
          continue;
        }
      }
    }
    if (/[A-Za-z0-9_$]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      out.push(word);
      lastSignificant = /^[0-9]/.test(word) ? "0" : "a";
      lastWord = word;
      i = j;
      continue;
    }
    out.push(ch);
    lastSignificant = ch;
    lastWord = "";
    i++;
  }
  return out
    .join("")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.length > 0)
    .join("\n");
}

export function minifyCode(text: string, language: FormatterLanguageId): MinifyResult {
  if (!text.trim()) return { ok: false, error: "Input is empty." };
  if (text.length > MAX_FORMAT_INPUT) return { ok: false, error: `Input is ${text.length.toLocaleString()} characters; the limit is ${MAX_FORMAT_INPUT.toLocaleString()}.` };
  switch (language) {
    case "css":
      return { ok: true, output: minifyCss(text, false) };
    case "scss":
    case "less":
      return { ok: true, output: minifyCss(text, true) };
    case "html":
      return { ok: true, output: minifyHtml(text) };
    case "json":
      try {
        return { ok: true, output: JSON.stringify(JSON.parse(text)) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON." };
      }
    case "javascript":
    case "typescript":
    case "jsx":
    case "tsx":
      return { ok: true, output: minifyJs(text) };
    default:
      return { ok: false, error: `Minify is not available for ${getFormatterLanguage(language).label}.` };
  }
}

export const CODE_FORMATTER_SAMPLE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>DevBox</title>
<style>
/* theme */
.card{padding:12px;border:1px solid #ddd}.card h2{margin:0 0 8px;font-size:18px}
</style></head>
<body><div class="card"><h2>Hello</h2><p>Formatted with <strong>Prettier</strong>, entirely in your browser.</p>
<ul><li>HTML</li><li>CSS</li><li>JavaScript</li></ul></div>
<script>
const items = document.querySelectorAll('li'); items.forEach((li, i) => { li.dataset.index = String(i) })
</script></body></html>`;
