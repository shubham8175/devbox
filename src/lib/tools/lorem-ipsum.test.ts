import { describe, expect, it } from "vitest";
import { generateLorem, LOREM_LIMITS, LOREM_WORDS, mulberry32, placeholderImageSvg, placeholderPresets, PLACEHOLDER_MAX_SIDE, toDataUrl } from "@/lib/tools/lorem-ipsum";

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("generateLorem", () => {
  it("is deterministic for the same seed and differs across seeds", () => {
    const a = generateLorem({ mode: "sentences", count: 5, startWithLorem: false, format: "plain", seed: 7 });
    const b = generateLorem({ mode: "sentences", count: 5, startWithLorem: false, format: "plain", seed: 7 });
    const c = generateLorem({ mode: "sentences", count: 5, startWithLorem: false, format: "plain", seed: 8 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("produces exactly the requested number of words", () => {
    const out = generateLorem({ mode: "words", count: 37, startWithLorem: false, format: "plain", seed: 1 });
    expect(countWords(out)).toBe(37);
    expect(out[0]).toBe(out[0].toUpperCase());
  });

  it("produces the requested number of sentences, each ending with a period", () => {
    const out = generateLorem({ mode: "sentences", count: 4, startWithLorem: false, format: "plain", seed: 3 });
    const sentences = out.match(/[^.]+\./g) ?? [];
    expect(sentences).toHaveLength(4);
    for (const s of sentences) {
      const n = countWords(s);
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(14);
    }
  });

  it("produces paragraphs separated by blank lines with 3–7 sentences each", () => {
    const out = generateLorem({ mode: "paragraphs", count: 3, startWithLorem: false, format: "plain", seed: 11 });
    const paras = out.split("\n\n");
    expect(paras).toHaveLength(3);
    for (const p of paras) {
      const n = (p.match(/\./g) ?? []).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it("starts with the classic opening when asked", () => {
    for (const mode of ["words", "sentences", "paragraphs"] as const) {
      const out = generateLorem({ mode, count: 3, startWithLorem: true, format: "plain", seed: 5 });
      expect(out.startsWith("Lorem ipsum dolor")).toBe(true);
    }
    const without = generateLorem({ mode: "words", count: 3, startWithLorem: false, format: "plain", seed: 5 });
    expect(countWords(without)).toBe(3);
  });

  it("keeps the word count even when the opening is longer than the request", () => {
    const out = generateLorem({ mode: "words", count: 3, startWithLorem: true, format: "plain", seed: 5 });
    expect(out).toBe("Lorem ipsum dolor");
  });

  it("wraps paragraphs in <p> for html and uses blank lines for markdown", () => {
    const html = generateLorem({ mode: "paragraphs", count: 2, startWithLorem: true, format: "html", seed: 2 });
    expect(html.match(/<p>/g)).toHaveLength(2);
    expect(html.startsWith("<p>Lorem ipsum")).toBe(true);
    expect(html.endsWith("</p>")).toBe(true);
    const md = generateLorem({ mode: "paragraphs", count: 2, startWithLorem: true, format: "markdown", seed: 2 });
    expect(md).not.toContain("<p>");
    expect(md.split("\n\n")).toHaveLength(2);
  });

  it("caps the count per mode and handles zero / invalid counts", () => {
    expect(countWords(generateLorem({ mode: "words", count: 5000, startWithLorem: false, format: "plain", seed: 1 }))).toBe(LOREM_LIMITS.words);
    expect(generateLorem({ mode: "sentences", count: 500, startWithLorem: false, format: "plain", seed: 1 }).match(/\./g)).toHaveLength(LOREM_LIMITS.sentences);
    expect(generateLorem({ mode: "paragraphs", count: 999, startWithLorem: false, format: "plain", seed: 1 }).split("\n\n")).toHaveLength(LOREM_LIMITS.paragraphs);
    expect(generateLorem({ mode: "words", count: 0, startWithLorem: true, format: "plain", seed: 1 })).toBe("");
    expect(generateLorem({ mode: "words", count: Number.NaN, startWithLorem: true, format: "plain", seed: 1 })).toBe("");
    expect(generateLorem({ mode: "words", count: -4, startWithLorem: true, format: "plain", seed: 1 })).toBe("");
  });

  it("only uses words from the classic list", () => {
    const out = generateLorem({ mode: "paragraphs", count: 5, startWithLorem: true, format: "plain", seed: 9 });
    for (const w of out.toLowerCase().replace(/[.,]/g, "").split(/\s+/)) {
      expect(LOREM_WORDS).toContain(w);
    }
  });
});

describe("mulberry32", () => {
  it("yields values in [0, 1) and repeats for the same seed", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(b()).toBe(v);
    }
  });
});

describe("placeholderImageSvg", () => {
  it("contains the dimensions and default label", () => {
    const svg = placeholderImageSvg({ width: 320, height: 180, background: "#eee", foreground: "#333" });
    expect(svg).toContain('width="320"');
    expect(svg).toContain('height="180"');
    expect(svg).toContain("320×180");
    expect(svg).toContain('fill="#eee"');
  });

  it("escapes custom text and rejects unsafe colours", () => {
    const svg = placeholderImageSvg({ width: 10, height: 10, text: '<script>"x"</script>', background: "url(javascript:alert(1))", foreground: "red" });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("url(");
    expect(svg).toContain('fill="red"');
  });

  it("clamps sizes", () => {
    const svg = placeholderImageSvg({ width: 99999, height: 0, background: "#fff", foreground: "#000" });
    expect(svg).toContain(`width="${PLACEHOLDER_MAX_SIDE}"`);
    expect(svg).toContain('height="1"');
  });

  it("has presets with sane sizes", () => {
    expect(placeholderPresets.map((p) => p.id)).toEqual(["avatar", "thumbnail", "banner", "og", "mobile"]);
    expect(placeholderPresets.find((p) => p.id === "og")).toMatchObject({ width: 1200, height: 630 });
  });
});

describe("toDataUrl", () => {
  it("encodes as base64 or percent-encoded utf8", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>320×180</text></svg>';
    const b64 = toDataUrl(svg, "base64");
    expect(b64.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(b64.split(",")[1]), (c) => c.charCodeAt(0)));
    expect(decoded).toBe(svg);
    const utf8 = toDataUrl(svg, "utf8");
    expect(utf8.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(utf8.slice("data:image/svg+xml,".length))).toBe(svg);
    expect(utf8).not.toContain("<");
  });
});
