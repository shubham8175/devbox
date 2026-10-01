import { describe, expect, it } from "vitest";
import { compareEntries, toEntries } from "@/lib/tools/time-compare";
import {
  generateUuidV7,
  generateUuids,
  inspectUuid,
  parseUuidValue,
  splitUuidPaste,
  unwrapUuid,
  UUID_COMPARE_SAMPLE,
} from "@/lib/tools/uuid";

// RFC 9562 appendix A test vectors, all Tuesday 2022-02-22 14:22:22 UTC−05:00.
const V1 = "C232AB00-9414-11EC-B3C8-9F6BDECED846";
const V6 = "1EC9414C-232A-6B00-B3C8-9F6BDECED846";
const V7 = "017F22E2-79B0-7CC3-98C4-DC0C0C07398F";
const RFC_ISO = "2022-02-22T19:22:22.000Z";

describe("inspectUuid timestamps", () => {
  it("decodes v7 (48-bit Unix ms)", () => {
    const info = inspectUuid(V7);
    expect(info.version).toBe(7);
    expect(info.timestamp?.iso).toBe(RFC_ISO);
    expect(info.timestamp?.unixMs).toBe(Date.parse(RFC_ISO));
  });

  it("decodes v1 (reordered Gregorian 100 ns ticks)", () => {
    const info = inspectUuid(V1);
    expect(info.version).toBe(1);
    expect(info.timestamp?.iso).toBe(RFC_ISO);
  });

  it("decodes v6 (big-endian Gregorian 100 ns ticks)", () => {
    const info = inspectUuid(V6);
    expect(info.version).toBe(6);
    expect(info.timestamp?.iso).toBe(RFC_ISO);
  });

  it("has no timestamp for v4, nil, or a non-RFC variant", () => {
    expect(inspectUuid("123e4567-e89b-42d3-a456-426614174000").timestamp).toBeNull();
    expect(inspectUuid("00000000-0000-0000-0000-000000000000").timestamp).toBeUndefined();
    // Same as V7 but with the Microsoft variant nibble (c).
    expect(inspectUuid("017F22E2-79B0-7CC3-C8C4-DC0C0C07398F").timestamp).toBeNull();
  });

  it("accepts braces, urn:uuid:, quotes and bare hex", () => {
    for (const raw of [`{${V7}}`, `urn:uuid:${V7}`, `"${V7}"`, `'{${V7}}'`, V7.replace(/-/g, "")]) {
      expect(inspectUuid(raw).normalized).toBe(V7.toLowerCase());
    }
    expect(unwrapUuid(` URN:UUID:${V1} `)).toBe(V1);
  });
});

describe("generateUuidV7", () => {
  it("sets version and variant bits and embeds the given time", () => {
    const date = new Date("2024-05-06T07:08:09.123Z");
    const id = generateUuidV7(date);
    const info = inspectUuid(id);
    expect(info.valid).toBe(true);
    expect(info.version).toBe(7);
    expect(info.variant).toBe("RFC 4122 / RFC 9562");
    expect(info.timestamp?.unixMs).toBe(date.getTime());
  });

  it("generates the requested version", () => {
    expect(generateUuids(3, 7).map((u) => inspectUuid(u).version)).toEqual([7, 7, 7]);
    expect(generateUuids(2).map((u) => inspectUuid(u).version)).toEqual([4, 4]);
  });
});

describe("uuid compare", () => {
  it("parses v1, v6 and v7 to the same instant", () => {
    const r = compareEntries(toEntries([V1, V6, `{${V7}}`], parseUuidValue));
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.fromPrevious)).toEqual([null, 0, 0]);
  });

  it("measures gaps between the sample values", () => {
    const r = compareEntries(toEntries(UUID_COMPARE_SAMPLE, parseUuidValue));
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.fromPrevious)).toEqual([null, 7 * 60_000, 2 * 3_600_000]);
    expect(r.summary?.ascending).toBe(true);
  });

  it("explains why a value can't be compared", () => {
    expect(parseUuidValue("123e4567-e89b-42d3-a456-426614174000").error).toBe(
      "UUID v4 has no timestamp — only v1, v6 and v7 can be compared.",
    );
    expect(parseUuidValue("00000000-0000-0000-0000-000000000000").error).toMatch(/Nil UUID has no timestamp/);
    expect(parseUuidValue("017F22E2-79B0-7CC3-C8C4-DC0C0C07398F").error).toMatch(/non-RFC 9562 variant/);
    expect(parseUuidValue("not-a-uuid").error).toMatch(/Not a valid UUID/);
  });

  it("splits pasted lists and strips wrappers", () => {
    const pasted = `${V1}\n{${V6}}, urn:uuid:${V7}\n"123e4567-e89b-42d3-a456-426614174000"`;
    expect(splitUuidPaste(pasted)).toEqual([V1, V6, V7, "123e4567-e89b-42d3-a456-426614174000"]);
    expect(splitUuidPaste(`["${V1}", "${V7}"]`)).toEqual([V1, V7]);
    expect(splitUuidPaste(V7.replace(/-/g, ""))).toEqual([V7]);
    expect(splitUuidPaste(`{${V7}}`)).toHaveLength(1);
  });
});
