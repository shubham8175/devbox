import { describe, expect, it } from "vitest";
import { COMMON_PATTERNS, REGEX_CHEATSHEET } from "@/lib/tools/regex-cheatsheet";
import { runRegex } from "@/lib/tools/regex";

describe("regex cheat sheet", () => {
  it("has sections with non-empty rows", () => {
    expect(REGEX_CHEATSHEET.length).toBeGreaterThanOrEqual(6);
    for (const s of REGEX_CHEATSHEET) {
      expect(s.title).toBeTruthy();
      expect(s.rows.length).toBeGreaterThan(0);
      for (const r of s.rows) {
        expect(r.code).toBeTruthy();
        expect(r.description).toBeTruthy();
      }
    }
  });

  it("has unique common pattern ids", () => {
    const ids = COMMON_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(18);
  });

  it.each(COMMON_PATTERNS.map((p) => [p.label, p]))("%s compiles and matches its own sample", (_label, p) => {
    expect(() => new RegExp(p.pattern, p.flags)).not.toThrow();
    const result = runRegex(p.pattern, p.flags, p.sample);
    expect(result.ok).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.some((m) => m.match.length > 0)).toBe(true);
  });

  it("validators reject their negative samples", () => {
    const ipv4 = COMMON_PATTERNS.find((p) => p.id === "ipv4")!;
    expect(runRegex(ipv4.pattern, ipv4.flags, ipv4.sample).matches.map((m) => m.match)).toEqual(["192.168.1.1", "8.8.8.8"]);
    const date = COMMON_PATTERNS.find((p) => p.id === "iso-date")!;
    expect(runRegex(date.pattern, date.flags, date.sample).matches).toHaveLength(2);
    const slug = COMMON_PATTERNS.find((p) => p.id === "slug")!;
    expect(runRegex(slug.pattern, slug.flags, slug.sample).matches.map((m) => m.match)).toEqual(["hello-world", "my-post-2024"]);
    const pw = COMMON_PATTERNS.find((p) => p.id === "strong-password")!;
    expect(runRegex(pw.pattern, pw.flags, pw.sample).matches.map((m) => m.match)).toEqual(["Correct-Horse-9-Battery"]);
    const semver = COMMON_PATTERNS.find((p) => p.id === "semver")!;
    const m = runRegex(semver.pattern, semver.flags, semver.sample).matches;
    expect(m).toHaveLength(3);
    expect(m[1].named.pre).toBe("beta.1");
  });
});
