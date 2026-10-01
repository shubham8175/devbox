import { describe, expect, it } from "vitest";
import { compareDigests, digestReport, expectedLengthHint, groupLabel, joinLines, parseExpectedHash, truncateDigest } from "@/lib/tools/digest-compare";
import { digest } from "@/lib/tools/hash";

const A = "a".repeat(64);
const B = "b".repeat(64);

describe("compareDigests", () => {
  it("groups identical digests and counts unique ones", () => {
    const r = compareDigests([
      { line: 1, digest: A },
      { line: 2, digest: B },
      { line: 3, digest: A.toUpperCase() },
    ]);
    expect(r.unique).toBe(2);
    expect(r.allIdentical).toBe(false);
    expect(r.groups).toEqual([{ lines: [1, 3], digest: A }]);
    expect(r.rows.map((x) => x.sameAs)).toEqual([[3], [], [1]]);
  });

  it("reports all identical only with two or more entries", () => {
    expect(compareDigests([{ line: 1, digest: A }]).allIdentical).toBe(false);
    expect(compareDigests([{ line: 2, digest: A }, { line: 5, digest: A }]).allIdentical).toBe(true);
    expect(compareDigests([]).unique).toBe(0);
  });

  it("matches real WebCrypto digests of equal text", async () => {
    const [x, y, z] = await Promise.all(["hello", "hello ", "hello"].map((t) => digest("SHA-256", t)));
    const r = compareDigests([x, y, z].map((d, i) => ({ line: i + 1, digest: d })));
    expect(r.groups[0].lines).toEqual([1, 3]);
    expect(x).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});

describe("expected hash", () => {
  it("normalises case, prefixes and separators", () => {
    expect(parseExpectedHash("  ")).toEqual({ status: "empty" });
    expect(parseExpectedHash(`sha256: ${A.toUpperCase()}`)).toEqual({ status: "ok", hex: A, algorithm: "SHA-256" });
    expect(parseExpectedHash("xyz").status).toBe("invalid");
    expect(parseExpectedHash("abc")).toEqual({ status: "ok", hex: "abc", algorithm: null });
  });

  it("hints when the length doesn't fit the selected algorithm", () => {
    expect(expectedLengthHint(parseExpectedHash(A), "SHA-256")).toBeNull();
    expect(expectedLengthHint(parseExpectedHash("a".repeat(40)), "SHA-256")).toMatch(/SHA-1/);
    expect(expectedLengthHint(parseExpectedHash("abc"), "SHA-256")).toMatch(/3 hex chars/);
  });
});

describe("formatting", () => {
  it("labels groups and truncates digests", () => {
    expect(groupLabel([1, 3])).toBe("#1 = #3");
    expect(joinLines([1, 3])).toBe("#1 and #3");
    expect(joinLines([1, 2, 4])).toBe("#1, #2 and #4");
    expect(truncateDigest("abcdef", 2)).toBe("ab…ef");
    expect(truncateDigest("abcde", 2)).toBe("abcde");
  });

  it("builds a report with matches and groups", () => {
    const r = compareDigests([
      { line: 1, digest: A },
      { line: 2, digest: B },
      { line: 3, digest: A },
    ]);
    const text = digestReport("SHA-256", r, (l) => `in${l}`, parseExpectedHash(A), true);
    expect(text).toContain(`#1 in1\n   ${A.toUpperCase()}  [matches expected]`);
    expect(text).toContain(`   ${B.toUpperCase()}  [no match]`);
    expect(text).toMatch(/2 unique digests; identical: #1 = #3\.$/);
  });
});
