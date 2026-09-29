import { describe, expect, it } from "vitest";
import { decodeEntities, encodeEntities, ENTITY_CATEGORIES, entityForChar, HTML_ENTITIES, HTML_ENTITIES_SAMPLE, searchEntities } from "@/lib/tools/html-entities";

describe("entity table", () => {
  it("has a few hundred entries with valid characters and known categories", () => {
    expect(HTML_ENTITIES.length).toBeGreaterThan(260);
    const cats = new Set(ENTITY_CATEGORIES.map((c) => c.id));
    for (const e of HTML_ENTITIES) {
      expect(String.fromCodePoint(e.code)).toBe(e.char);
      expect(cats.has(e.category)).toBe(true);
      expect(e.description.length).toBeGreaterThan(0);
      if (e.name) expect(e.name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    }
  });

  it("includes the essentials", () => {
    for (const name of ["amp", "lt", "gt", "quot", "apos", "nbsp", "copy", "reg", "trade", "euro", "mdash", "hellip", "rarr", "alpha", "omega", "eacute", "szlig", "ntilde", "frac12", "check", "infin", "ne"]) {
      expect(HTML_ENTITIES.find((e) => e.name === name), name).toBeDefined();
    }
    expect(entityForChar("✓")?.code).toBe(10003);
  });
});

describe("encodeEntities", () => {
  it("escapes only the unsafe five when onlyUnsafe is set", () => {
    expect(encodeEntities(`<a href="x">Tom & Jerry's é</a>`, { mode: "named", onlyUnsafe: true })).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s é&lt;/a&gt;");
    expect(encodeEntities(`<&>"'`, { mode: "numeric", onlyUnsafe: true })).toBe("&#60;&#38;&#62;&#34;&#39;");
    expect(encodeEntities(`<&>"'`, { mode: "hex", onlyUnsafe: true })).toBe("&#x3C;&#x26;&#x3E;&#x22;&#x27;");
  });

  it("encodes all non-ASCII, named where possible, numeric otherwise", () => {
    expect(encodeEntities("© é → ₹ 😀", { mode: "named", onlyUnsafe: false })).toBe("&copy; &eacute; &rarr; &#8377; &#128512;");
    expect(encodeEntities("©😀", { mode: "numeric", onlyUnsafe: false })).toBe("&#169;&#128512;");
    expect(encodeEntities("©😀", { mode: "hex", onlyUnsafe: false })).toBe("&#xA9;&#x1F600;");
  });

  it("leaves plain ASCII alone and handles empty input", () => {
    expect(encodeEntities("hello world 123", { mode: "named", onlyUnsafe: false })).toBe("hello world 123");
    expect(encodeEntities("", { mode: "named", onlyUnsafe: false })).toBe("");
  });
});

describe("decodeEntities", () => {
  it("decodes named, decimal and hex references", () => {
    expect(decodeEntities("&lt;b&gt; &amp; &copy; &eacute; &#160;|&#xA0;|&#x1F600;|&#128512;")).toBe("<b> & © é  | |😀|😀");
  });

  it("decodes legacy references without a semicolon only for the classic set", () => {
    expect(decodeEntities("a &amp b &lt c &copy 2024 &nbsp!")).toBe("a & b < c © 2024  !");
    expect(decodeEntities("&eacute test &rarr x")).toBe("&eacute test &rarr x");
    expect(decodeEntities("&#65 &#x42")).toBe("A B");
  });

  it("leaves invalid or unknown references untouched and never double-decodes", () => {
    expect(decodeEntities("&bogus; &#; &#xZZ; & alone &;")).toBe("&bogus; &#; &#xZZ; & alone &;");
    expect(decodeEntities("&amp;lt; &amp;amp;")).toBe("&lt; &amp;");
    expect(decodeEntities("&#0; &#xD800; &#1114112;")).toBe("&#0; &#xD800; &#1114112;");
  });

  it("maps C1 numeric references to Windows-1252 like browsers do", () => {
    expect(decodeEntities("&#150; &#x99;")).toBe("– ™");
  });

  it("round-trips the sample through encode and decode", () => {
    for (const mode of ["named", "numeric", "hex"] as const) {
      for (const onlyUnsafe of [true, false]) {
        expect(decodeEntities(encodeEntities(HTML_ENTITIES_SAMPLE, { mode, onlyUnsafe }))).toBe(HTML_ENTITIES_SAMPLE);
      }
    }
  });
});

describe("searchEntities", () => {
  it("returns everything (or a category) for an empty query", () => {
    expect(searchEntities("")).toHaveLength(HTML_ENTITIES.length);
    expect(searchEntities("", "greek").every((e) => e.category === "greek")).toBe(true);
    expect(searchEntities("", "greek").length).toBeGreaterThan(40);
  });

  it("matches by name, char, code and description with sensible ranking", () => {
    expect(searchEntities("copy")[0].name).toBe("copy");
    expect(searchEntities("&copy;")[0].name).toBe("copy");
    expect(searchEntities("©")[0].name).toBe("copy");
    expect(searchEntities("169")[0].name).toBe("copy");
    expect(searchEntities("0xA9")[0].name).toBe("copy");
    expect(searchEntities("U+00A9")[0].name).toBe("copy");
    expect(searchEntities("copyright")[0].name).toBe("copy");
    expect(searchEntities("arrow").every((e) => e.description.toLowerCase().includes("arrow") || e.name?.toLowerCase().includes("arrow"))).toBe(true);
    expect(searchEntities("zzzz")).toEqual([]);
  });

  it("restricts to a category when asked", () => {
    const r = searchEntities("a", "arrows");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.category === "arrows")).toBe(true);
  });
});
