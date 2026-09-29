import { describe, expect, it } from "vitest";
import { contentTypeHeader, detectQueryKind, isCompressible, lookupByExtension, lookupByType, MIME_CATEGORIES, MIME_SAMPLE, MIME_TABLE, normalizeExtension, normalizeType, searchMime } from "@/lib/tools/mime-types";

describe("table integrity", () => {
  it("has a broad table with valid categories and unique types", () => {
    expect(MIME_TABLE.length).toBeGreaterThanOrEqual(180);
    const types = new Set<string>();
    for (const entry of MIME_TABLE) {
      expect(MIME_CATEGORIES).toContain(entry.category);
      expect(entry.type.startsWith(`${entry.category}/`)).toBe(true);
      expect(types.has(entry.type)).toBe(false);
      types.add(entry.type);
      for (const ext of entry.extensions) expect(ext).toMatch(/^[a-z0-9+-]+$/);
    }
  });

  it("covers the web essentials", () => {
    for (const ext of ["html", "css", "js", "mjs", "json", "svg", "png", "webp", "avif", "woff2", "wasm", "pdf", "zip", "mp4", "webm", "glb", "ics", "vcf", "eml", "parquet", "proto", "graphql", "webmanifest", "jsonl", "tsx", "rs", "go", "toml"]) {
      expect(lookupByExtension(ext).length, ext).toBeGreaterThan(0);
    }
    for (const type of ["multipart/form-data", "application/x-www-form-urlencoded", "application/octet-stream", "text/event-stream", "application/problem+json"]) {
      expect(lookupByType(type), type).not.toBeNull();
    }
  });
});

describe("normalisation and lookups", () => {
  it("normalises extensions from bare, dotted, file and URL forms", () => {
    expect(normalizeExtension("png")).toBe("png");
    expect(normalizeExtension(".PNG")).toBe("png");
    expect(normalizeExtension("photo.final.png")).toBe("png");
    expect(normalizeExtension("https://x.test/a/b.png?v=2#hash")).toBe("png");
    expect(normalizeExtension("C:\\Users\\me\\archive.tar.gz")).toBe("gz");
    expect(normalizeExtension("  ")).toBe("");
  });

  it("looks up by extension in every accepted form", () => {
    for (const form of ["png", ".png", "file.png", "https://x/y.png?z"]) {
      expect(lookupByExtension(form)[0]?.type, form).toBe("image/png");
    }
    expect(lookupByExtension("nope-ext")).toEqual([]);
  });

  it("returns every candidate for ambiguous extensions like .ts", () => {
    const types = lookupByExtension("ts").map((e) => e.type);
    expect(types).toContain("text/x-typescript");
    expect(types).toContain("video/mp2t");
  });

  it("looks up by type, stripping parameters and honouring aliases", () => {
    expect(normalizeType(" Application/JSON; charset=utf-8 ")).toBe("application/json");
    expect(lookupByType("application/json; charset=utf-8")?.extensions).toContain("json");
    expect(lookupByType("application/javascript")?.type).toBe("text/javascript");
    expect(lookupByType("image/jpg")?.type).toBe("image/jpeg");
    expect(lookupByType("application/x-nothing")).toBeNull();
  });

  it("detects what kind of query was typed", () => {
    expect(detectQueryKind("image/png")).toBe("type");
    expect(detectQueryKind("application/json; charset=utf-8")).toBe("type");
    expect(detectQueryKind("png")).toBe("extension");
    expect(detectQueryKind(".woff2")).toBe("extension");
    expect(detectQueryKind("https://cdn.test/app.js?x=1")).toBe("extension");
    expect(detectQueryKind("report.xlsx")).toBe("extension");
    expect(detectQueryKind("spreadsheet")).toBe("text");
    expect(detectQueryKind("")).toBe("text");
  });
});

describe("search", () => {
  it("ranks exact type and extension matches first", () => {
    expect(searchMime("image/png")[0].type).toBe("image/png");
    expect(searchMime("mp3")[0].type).toBe("audio/mpeg");
    expect(searchMime("file.pdf")[0].type).toBe("application/pdf");
  });

  it("finds entries by description words", () => {
    const results = searchMime("excel workbook").map((e) => e.type);
    expect(results.slice(0, 3)).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(searchMime("font").every((e) => e.category === "font" || /font/i.test(e.description))).toBe(true);
  });

  it("returns nothing for blank input and respects the limit", () => {
    expect(searchMime("   ")).toEqual([]);
    expect(searchMime("a", 5).length).toBeLessThanOrEqual(5);
    expect(() => searchMime("x".repeat(10_000))).not.toThrow();
  });
});

describe("headers and compression", () => {
  it("builds Content-Type headers with a sensible charset", () => {
    expect(contentTypeHeader("text/html")).toBe("Content-Type: text/html; charset=utf-8");
    expect(contentTypeHeader("application/json")).toBe("Content-Type: application/json");
    expect(contentTypeHeader("image/png")).toBe("Content-Type: image/png");
    expect(contentTypeHeader("text/csv", "ISO-8859-1")).toBe("Content-Type: text/csv; charset=iso-8859-1");
    expect(contentTypeHeader("image/svg+xml")).toBe("Content-Type: image/svg+xml; charset=utf-8");
    expect(contentTypeHeader("")).toBe("");
  });

  it("reports compressibility from the table or a textual heuristic", () => {
    expect(isCompressible("text/html")).toBe(true);
    expect(isCompressible("font/woff2")).toBe(false);
    expect(isCompressible("image/svg+xml")).toBe(true);
    expect(isCompressible("application/vnd.custom+json")).toBe(true);
    expect(isCompressible("application/vnd.custom-binary")).toBe(false);
  });

  it("ships png as the sample", () => {
    expect(lookupByExtension(MIME_SAMPLE)[0].type).toBe("image/png");
  });
});
