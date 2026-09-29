import { describe, expect, it } from "vitest";
import { marked } from "marked";
import {
  addHeadingIds,
  buildToc,
  createSlugger,
  extractHeadings,
  MARKDOWN_SAMPLE,
  markdownStats,
  MAX_MARKDOWN_INPUT,
  openLinksInNewTab,
  PURIFY_CONFIG,
  renderMarkdown,
  slugifyHeading,
  wrapHtmlDocument,
  type MarkedLike,
  type PurifierLike,
} from "@/lib/tools/markdown";

const markedLike: MarkedLike = { parse: (src, opts) => marked.parse(src, { ...opts, async: false }) };
/**
 * DOMPurify needs a DOM, and jsdom is deliberately not a dependency, so node
 * tests use a pass-through purifier. The real sanitiser is exercised in the
 * browser: pasting `<script>alert(1)</script>` or `<a href="javascript:x">`
 * into the Markdown tool renders nothing executable (DOMPurify strips both).
 */
const passthrough: PurifierLike = { sanitize: (html) => html };

function rendered(text: string, breaks = false) {
  const r = renderMarkdown(markedLike, passthrough, text, { gfm: true, breaks });
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("slugifyHeading / createSlugger", () => {
  it("builds GitHub-style slugs", () => {
    expect(slugifyHeading("Hello World")).toBe("hello-world");
    expect(slugifyHeading("  What's new in v2.0? (beta) ")).toBe("whats-new-in-v20-beta");
    expect(slugifyHeading("Ünïcode & émojis 🎉")).toBe("ünïcode--émojis-");
    expect(slugifyHeading("snake_case-kebab")).toBe("snake_case-kebab");
    expect(slugifyHeading("<code>inline</code> tag")).toBe("inline-tag");
  });

  it("dedupes with -1, -2 and never collides", () => {
    const slug = createSlugger();
    expect(slug("Intro")).toBe("intro");
    expect(slug("Intro")).toBe("intro-1");
    expect(slug("Intro")).toBe("intro-2");
    expect(slug("Intro-1")).toBe("intro-1-1");
    expect(slug("!!!")).toBe("section");
  });
});

describe("extractHeadings", () => {
  it("reads ATX headings, strips inline syntax and skips fenced code", () => {
    const md = "# Title\n\n```md\n# not a heading\n```\n\n## **Bold** and `code` [link](x) ##\n\n~~~\n### nope\n~~~\n\n### Third\n#NotAHeading\n####### too many";
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: "Title", id: "title" },
      { level: 2, text: "Bold and code link", id: "bold-and-code-link" },
      { level: 3, text: "Third", id: "third" },
    ]);
  });

  it("dedupes ids in document order", () => {
    expect(extractHeadings("# A\n## A\n## A").map((h) => h.id)).toEqual(["a", "a-1", "a-2"]);
  });
});

describe("buildToc", () => {
  it("nests relative to the shallowest heading", () => {
    const toc = buildToc([
      { level: 2, text: "One", id: "one" },
      { level: 3, text: "One A", id: "one-a" },
      { level: 2, text: "Two", id: "two" },
    ]);
    expect(toc).toBe("- [One](#one)\n  - [One A](#one-a)\n- [Two](#two)");
    expect(buildToc([])).toBe("");
  });
});

describe("markdownStats", () => {
  it("counts words, headings, links, images, code blocks and tables", () => {
    const s = markdownStats(MARKDOWN_SAMPLE);
    expect(s.headings).toBe(5);
    expect(s.codeBlocks).toBe(1);
    expect(s.tables).toBe(1);
    expect(s.images).toBe(1);
    expect(s.links).toBe(1);
    expect(s.words).toBeGreaterThan(60);
  });

  it("ignores words inside fenced code and counts bare and autolinked URLs", () => {
    expect(markdownStats("```\none two three\n```").words).toBe(0);
    expect(markdownStats("see <https://a.test> and https://b.test/x plus [c](https://c.test)").links).toBe(3);
    expect(markdownStats("").words).toBe(0);
  });
});

describe("HTML post-passes", () => {
  it("adds deduped ids to headings and keeps other attributes", () => {
    const { html, headings } = addHeadingIds('<h1>Hi &amp; bye</h1><h2 class="x" id="old">Hi &amp; bye</h2><h3><em>Em</em> text</h3>');
    expect(html).toBe('<h1 id="hi--bye">Hi &amp; bye</h1><h2 id="hi--bye-1" class="x">Hi &amp; bye</h2><h3 id="em-text"><em>Em</em> text</h3>');
    expect(headings).toEqual([
      { level: 1, text: "Hi & bye", id: "hi--bye" },
      { level: 2, text: "Hi & bye", id: "hi--bye-1" },
      { level: 3, text: "Em text", id: "em-text" },
    ]);
  });

  it("opens links in a new tab with a safe rel, replacing existing target/rel", () => {
    expect(openLinksInNewTab('<a href="https://x.test">x</a>')).toBe('<a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>');
    expect(openLinksInNewTab('<a target="_self" href="/a" rel="x" title="t">a</a>')).toBe('<a href="/a" title="t" target="_blank" rel="noopener noreferrer">a</a>');
    expect(openLinksInNewTab("<abbr title=\"a\">x</abbr>")).toBe("<abbr title=\"a\">x</abbr>");
  });
});

describe("renderMarkdown (real marked, pass-through purifier)", () => {
  it("renders GFM features from the sample", () => {
    const r = rendered(MARKDOWN_SAMPLE);
    expect(r.html).toContain('<h1 id="devbox">DevBox</h1>');
    expect(r.html).toContain('<h2 id="features">Features</h2>');
    expect(r.html).toMatch(/<input[^>]*checked[^>]*type="checkbox"/);
    expect(r.html).toContain("<table>");
    expect(r.html).toContain('<code class="language-bash">');
    expect(r.html).toContain('<a href="http://localhost:3000" target="_blank" rel="noopener noreferrer">');
    expect(r.html).toContain("<del>strikethrough</del>");
    expect(r.html).toContain('<img src="https://example.com/devbox.png" alt="Screenshot" title="DevBox home">');
    expect(r.headings.map((h) => h.id)).toEqual(["devbox", "features", "roadmap", "usage", "contributing"]);
    expect(r.stats.headings).toBe(5);
  });

  it("respects the breaks option", () => {
    expect(rendered("a\nb").html).toBe("<p>a\nb</p>\n");
    expect(rendered("a\nb", true).html).toBe("<p>a<br>b</p>\n");
  });

  it("passes the purifier config that forbids styles and keeps ids, and hands the raw HTML to it", () => {
    let seenConfig: Record<string, unknown> | null = null;
    let seenHtml = "";
    const spy: PurifierLike = {
      sanitize: (html, cfg) => {
        seenHtml = html;
        seenConfig = cfg;
        return html.replace(/<script[\s\S]*?<\/script>/g, "");
      },
    };
    const r = renderMarkdown(markedLike, spy, "# T\n\n<script>alert(1)</script>\n\ntext", { breaks: false });
    expect(r.ok && r.html).not.toContain("<script>");
    expect(seenHtml).toContain("<script>alert(1)</script>"); // marked does not sanitise; DOMPurify must
    expect(seenConfig).toBe(PURIFY_CONFIG);
    expect(PURIFY_CONFIG).toMatchObject({ USE_PROFILES: { html: true }, ADD_ATTR: ["id"], FORBID_ATTR: ["style"] });
  });

  it("caps input size", () => {
    const r = renderMarkdown(markedLike, passthrough, "a".repeat(MAX_MARKDOWN_INPUT + 1), { breaks: false });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/limit/) });
  });
});

describe("wrapHtmlDocument", () => {
  it("produces a standalone document with the escaped title and the body", () => {
    const doc = wrapHtmlDocument("<p>hi</p>", 'A "<b>" & title');
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain("<title>A &quot;&lt;b&gt;&quot; &amp; title</title>");
    expect(doc).toContain("<p>hi</p>");
    expect(doc).toContain('<meta charset="utf-8">');
    expect(wrapHtmlDocument("", "")).toContain("<title>Document</title>");
  });
});
