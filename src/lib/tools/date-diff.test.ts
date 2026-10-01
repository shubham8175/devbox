import { describe, expect, it } from "vitest";
import { DATE_TIMELINE_SAMPLE, diffDates, parseTimelineValue } from "@/lib/tools/date-diff";
import { compareEntries, parseEpochValue, toEntries } from "@/lib/tools/time-compare";

describe("date diff", () => {
  it("diffs two dates with a calendar breakdown", () => {
    const r = diffDates("2024-01-15T00:00", "2025-03-20T12:00");
    expect(r.ok && r.calendar).toEqual({ years: 1, months: 2, days: 5 });
    expect(r.ok && r.direction).toBe("future");
  });

  it("timeline sample parses cleanly and is in order", () => {
    const r = compareEntries(toEntries(DATE_TIMELINE_SAMPLE, parseEpochValue));
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(3);
    expect(r.summary?.ascending).toBe(true);
  });
});

describe("parseTimelineValue", () => {
  it("reads a bare date as local midnight, matching local date-times", () => {
    expect(parseTimelineValue("2024-01-15").date?.getTime()).toBe(new Date(2024, 0, 15).getTime());
    expect(parseTimelineValue("2024-01-15 10:30").date?.getTime()).toBe(new Date(2024, 0, 15, 10, 30).getTime());
  });

  it("rejects impossible dates and still accepts epochs", () => {
    expect(parseTimelineValue("2024-02-30").error).toMatch(/not a valid date/);
    expect(parseTimelineValue("1700000000").date?.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  });
});
