import { describe, expect, it } from "vitest";
import {
  compareEntries,
  EPOCH_COMPARE_SAMPLE,
  OBJECTID_COMPARE_SAMPLE,
  parseEpochValue,
  parseObjectIdValue,
  signedDuration,
  splitEpochPaste,
  splitObjectIdPaste,
  toEntries,
} from "@/lib/tools/time-compare";

describe("epoch compare", () => {
  it("mixes seconds, milliseconds and ISO and measures gaps", () => {
    const r = compareEntries(toEntries(["1700000000", "1700003600000", "2023-11-14T22:13:20Z"], parseEpochValue));
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.fromPrevious)).toEqual([null, 3_600_000, -3_600_000]);
    expect(r.rows.map((x) => x.fromFirst)).toEqual([null, 3_600_000, 0]);
    expect(r.summary?.span).toBe(3_600_000);
    expect(r.summary?.ascending).toBe(false);
    expect(r.summary?.latest.line).toBe(2);
  });

  it("skips empty fields but keeps field numbers, and reports bad fields", () => {
    const r = compareEntries(toEntries(["1700000000", "", "nope", "1700000060"], parseEpochValue));
    expect(r.errors.map((e) => e.line)).toEqual([3]);
    expect(r.rows.map((x) => x.line)).toEqual([1, 4]);
    expect(r.rows.map((x) => x.fromPrevious)).toEqual([null, 60_000]);
    expect(r.summary?.ascending).toBe(true);
  });

  it("splits pasted lists by line only, so date strings stay whole", () => {
    expect(splitEpochPaste("Jan 15, 2024 10:00 UTC\n1700000000\n\n")).toEqual(["Jan 15, 2024 10:00 UTC", "1700000000"]);
  });

  it("parses the sample cleanly", () => {
    expect(compareEntries(toEntries(EPOCH_COMPARE_SAMPLE, parseEpochValue)).errors).toEqual([]);
  });
});

describe("objectid compare", () => {
  it("accepts raw, quoted, ObjectId() and $oid forms in a field", () => {
    const values = ["65539c80a1b2c3d4e5000001", '"65539c8fa1b2c3d4e5000002"', 'ObjectId("65539d00a1b2c3d4e5000003")', '{"$oid": "65539d01a1b2c3d4e5000004"}'];
    const r = compareEntries(toEntries(values, parseObjectIdValue));
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.fromPrevious)).toEqual([null, 15_000, 113_000, 1_000]);
  });

  it("splits a pasted list on newlines, commas and spaces", () => {
    expect(splitObjectIdPaste('65539c80a1b2c3d4e5000001, ObjectId("65539d00a1b2c3d4e5000003")\n{"$oid": "65539d01a1b2c3d4e5000004"}')).toEqual([
      "65539c80a1b2c3d4e5000001",
      "65539d00a1b2c3d4e5000003",
      "65539d01a1b2c3d4e5000004",
    ]);
  });

  it("flags invalid ids", () => {
    expect(parseObjectIdValue("xyz").error).toMatch(/24 characters/);
  });

  it("parses the sample cleanly", () => {
    expect(compareEntries(toEntries(OBJECTID_COMPARE_SAMPLE, parseObjectIdValue)).errors).toEqual([]);
  });
});

describe("signedDuration", () => {
  it("formats sign and zero", () => {
    expect(signedDuration(0)).toBe("same time");
    expect(signedDuration(90_000)).toBe("+1 minute, 30 seconds");
    expect(signedDuration(-3_600_000)).toBe("−1 hour");
  });
});
