/**
 * Markdown rendering helpers. `marked` and DOMPurify are passed in (see
 * `MarkedLike` / `PurifierLike`) so the UI can lazy-load them and node tests
 * can exercise the pure helpers plus marked's output with a stub purifier.
 */

/** Inputs above this size are refused; rendering is synchronous on the main thread. */
export const MAX_MARKDOWN_INPUT = 500 * 1024;

export interface MarkedLike {
  parse: (src: string, options: { gfm: boolean; breaks: boolean }) => string;
}

export interface PurifierLike {
  sanitize: (html: string, config: Record<string, unknown>) => string;
}

export interface MarkdownHeading {
  level: number;
  text: string;
  id: string;
}

export interface MarkdownStats {
  words: number;
  headings: number;
  links: number;
  images: number;
  codeBlocks: number;
  tables: number;
}

export interface RenderMarkdownOk {
  ok: true;
  /** Sanitised HTML; safe to inject. */
  html: string;
  headings: MarkdownHeading[];
  stats: MarkdownStats;
}

export type RenderMarkdownResult = RenderMarkdownOk | { ok: false; error: string };

/**
 * DOMPurify configuration: the HTML profile only (no SVG/MathML), no inline
 * styles, and `id` kept so the outline can jump to headings. DOMPurify already
 * strips `javascript:` URLs and event handler attributes.
 */
export const PURIFY_CONFIG: Record<string, unknown> = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ["id"],
  FORBID_ATTR: ["style"],
  FORBID_TAGS: ["style", "form", "input"],
};

// ---------------------------------------------------------------------------
// Slugs & headings
// ---------------------------------------------------------------------------

/** GitHub-style heading slug: lowercase, punctuation removed, spaces → hyphens. */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    // GitHub turns every space into a hyphen (so "a & b" becomes "a--b").
    .replace(/\s/g, "-");
}

/** Deduplicates slugs the way GitHub does: `title`, `title-1`, `title-2`, ... */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugifyHeading(text) || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (count === 0) return base;
    // Guard against a later heading literally named "title-1".
    let candidate = `${base}-${count}`;
    while (seen.has(candidate)) candidate = `${candidate}-1`;
    seen.set(candidate, 1);
    return candidate;
  };
}

/** Strip inline markdown syntax for outline text: emphasis, code, links, images. */
function plainInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/** ATX headings from markdown source, skipping fenced code blocks. */
export function extractHeadings(markdown: string): MarkdownHeading[] {
  const out: MarkdownHeading[] = [];
  const slug = createSlugger();
  let fence: string | null = null;
  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const m = /^\s{0,3}(#{1,6})\s+(.*?)\s*(?:\s#+\s*)?$/.exec(line);
    if (!m) continue;
    const text = plainInline(m[2]);
    if (!text) continue;
    out.push({ level: m[1].length, text, id: slug(text) });
  }
  return out;
}

/** Nested markdown list linking to each heading's id. */
export function buildToc(headings: MarkdownHeading[]): string {
  if (!headings.length) return "";
  const min = Math.min(...headings.map((h) => h.level));
  return headings.map((h) => `${"  ".repeat(h.level - min)}- [${h.text}](#${h.id})`).join("\n");
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function markdownStats(markdown: string): MarkdownStats {
  let codeBlocks = 0;
  let tables = 0;
  let fence: string | null = null;
  const prose: string[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) {
        fence = fenceMatch[1];
        codeBlocks++;
      } else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    // A table is a header row followed by a delimiter row like |---|:--:|
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes("-") && i > 0 && lines[i - 1].includes("|") && (line.includes("|") || lines[i - 1].trim().startsWith("|"))) {
      tables++;
    }
    prose.push(line);
  }
  const text = prose.join("\n");
  const images = (text.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;
  const links = (text.match(/(?<!!)\[[^\]]+\]\([^)]*\)|(?<!!)\[[^\]]+\]\[[^\]]*\]|<https?:\/\/[^>\s]+>/g) ?? []).length + (text.match(/(?<![(<\[\]"'])\bhttps?:\/\/[^\s<>)\]]+/g) ?? []).length;
  const words = (
    text
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/`[^`]*`/g, " ")
      .replace(/[#>*_~|-]+/g, " ")
      .match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []
  ).length;
  return { words, headings: extractHeadings(markdown).length, links, images, codeBlocks, tables };
}

// ---------------------------------------------------------------------------
// HTML post-passes (run on sanitised HTML)
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * Add GitHub-style ids to <h1>–<h6> and collect them for the outline. Runs on
 * DOMPurify output, whose serialisation is regular enough for a regex.
 */
export function addHeadingIds(html: string): { html: string; headings: MarkdownHeading[] } {
  const headings: MarkdownHeading[] = [];
  const slug = createSlugger();
  const out = html.replace(/<h([1-6])((?:\s+[^\s=>]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*>([\s\S]*?)<\/h\1\s*>/gi, (_m, level: string, attrs: string, inner: string) => {
    const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    const id = slug(text);
    headings.push({ level: Number(level), text, id });
    const rest = attrs.replace(/\s+id=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return `<h${level} id="${id}"${rest}>${inner}</h${level}>`;
  });
  return { html: out, headings };
}

/** Make every link open in a new tab without leaking the opener. */
export function openLinksInNewTab(html: string): string {
  return html.replace(/<a\b((?:\s+[^\s=>]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*>/gi, (_m, attrs: string) => {
    const rest = attrs.replace(/\s+(target|rel)=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return `<a${rest} target="_blank" rel="noopener noreferrer">`;
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderMarkdown(marked: MarkedLike, purify: PurifierLike, text: string, options: { gfm?: boolean; breaks: boolean }): RenderMarkdownResult {
  if (text.length > MAX_MARKDOWN_INPUT) {
    return { ok: false, error: `Input is ${(text.length / 1024).toFixed(0)} KB; the preview limit is ${MAX_MARKDOWN_INPUT / 1024} KB.` };
  }
  let raw: string;
  try {
    raw = marked.parse(text, { gfm: options.gfm ?? true, breaks: options.breaks });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.split("\n")[0] : "Could not render this Markdown." };
  }
  // Sanitise first, then decorate: the post-passes only add id/target/rel attributes.
  const clean = purify.sanitize(raw, PURIFY_CONFIG);
  const withIds = addHeadingIds(clean);
  return { ok: true, html: openLinksInNewTab(withIds.html), headings: withIds.headings, stats: markdownStats(text) };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Wrap rendered HTML in a standalone document with minimal embedded CSS. */
export function wrapHtmlDocument(html: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title || "Document")}</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 760px; margin: 2rem auto; padding: 0 1rem; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  pre { padding: 0.75rem 1rem; overflow: auto; border: 1px solid #8884; border-radius: 6px; }
  code { padding: 0.1em 0.3em; border-radius: 4px; background: #8882; }
  pre code { padding: 0; background: none; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #8886; padding: 0.3rem 0.6rem; }
  blockquote { margin: 0; padding-left: 1rem; border-left: 3px solid #8888; color: #777; }
  img { max-width: 100%; }
  a { color: #3b6fd9; }
</style>
</head>
<body>
${html}
</body>
</html>
`;
}

export const MARKDOWN_SAMPLE = `# DevBox

> A collection of small, fast developer tools that run **entirely in your browser**.

## Features

- Instant results, no sign-up
- Works offline as an installed app
- Nothing you paste ever leaves the page

### Roadmap

- [x] Markdown preview
- [x] JSON Schema validator
- [ ] Regex crossword

## Usage

Install the dependencies and start the dev server:

\`\`\`bash
npm install
npm run dev
\`\`\`

Then open [http://localhost:3000](http://localhost:3000) and pick a tool.

| Tool | Category | Offline |
| --- | --- | :---: |
| JWT Decoder | Security | yes |
| Cron Parser | DevOps | yes |
| IP Location | Network | no |

## Contributing

1. Fork the repo
2. Create a branch: \`git checkout -b feat/my-tool\`
3. Open a pull request

![Screenshot](https://example.com/devbox.png "DevBox home")

---

Made with care. Inline \`code\`, *emphasis* and ~~strikethrough~~ all work.
`;
