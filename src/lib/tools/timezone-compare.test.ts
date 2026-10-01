import { describe, expect, it } from "vitest";
import {
  dayShiftLabel,
  formatMinutesDiff,
  meetingSlots,
  resolveZone,
  splitZonePaste,
  toZonedInputValue,
  worldClock,
  WORLD_CLOCK_SAMPLE,
} from "@/lib/tools/timezone-compare";

describe("resolveZone", () => {
  it("accepts IANA ids in any case, cities, abbreviations and offsets", () => {
    expect(resolveZone("Europe/London").zone).toBe("Europe/London");
    expect(resolveZone("asia/kolkata").zone).toBe("Asia/Kolkata");
    expect(resolveZone("new york").zone).toBe("America/New_York");
    expect(resolveZone("Los Angeles").zone).toBe("America/Los_Angeles");
    expect(resolveZone("IST").zone).toBe("Asia/Kolkata");
    expect(resolveZone("pst").zone).toBe("America/Los_Angeles");
    expect(resolveZone("gmt").zone).toBe("UTC");
    const offset = resolveZone("UTC+5:30").zone!;
    expect(offset).toBeTruthy();
    expect(worldClock(new Date("2026-01-15T00:00:00Z"), [offset]).rows[0].offset).toBe(330);
    expect(worldClock(new Date("2026-01-15T00:00:00Z"), [resolveZone("GMT-8").zone!]).rows[0].offset).toBe(-480);
  });

  it("rejects unknown zones", () => {
    expect(resolveZone("Mars/Olympus").error).toMatch(/Unknown timezone/);
    expect(resolveZone("+25:00").error).toMatch(/offset/);
  });
});

describe("worldClock", () => {
  // 2026-01-15 is a Thursday; no DST in the northern hemisphere.
  const instant = new Date("2026-01-15T04:00:00Z");

  it("compares every zone with the first", () => {
    const { rows, errors } = worldClock(instant, WORLD_CLOCK_SAMPLE);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.time)).toEqual(["04:00:00", "09:30:00", "04:00:00", "23:00:00"]);
    expect(rows.map((r) => r.offset)).toEqual([0, 330, 0, -300]);
    expect(rows.map((r) => formatMinutesDiff(r.diffFromFirst))).toEqual(["same", "+5h 30m", "same", "-5h"]);
    expect(rows.map((r) => r.dayShift)).toEqual([0, 0, 0, -1]);
    expect(rows.map((r) => r.work)).toEqual(["outside", "working", "outside", "outside"]);
    expect(rows[1].date).toBe("Thu, Jan 15, 2026");
    expect(rows[3].date).toBe("Wed, Jan 14, 2026");
  });

  it("follows DST at the instant", () => {
    const summer = worldClock(new Date("2026-07-01T12:00:00Z"), ["Europe/London", "America/New_York"]).rows;
    expect(summer.map((r) => r.offset)).toEqual([60, -240]);
    expect(summer[1].diffFromFirst).toBe(-300);
  });

  it("marks weekends and keeps field numbers past empty or bad fields", () => {
    const sat = new Date("2026-01-17T10:00:00Z");
    const { rows, errors } = worldClock(sat, ["", "UTC", "nowhere", "Asia/Tokyo"]);
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
    expect(errors.map((e) => e.line)).toEqual([3]);
    expect(rows.map((r) => r.work)).toEqual(["weekend", "weekend"]);
    expect(rows[1].dayShift).toBe(0);
    expect(dayShiftLabel(rows[1].dayShift)).toBe("same day");
  });
});

describe("meetingSlots", () => {
  it("finds hours that are inside working hours everywhere", () => {
    const instant = new Date("2026-01-15T12:00:00Z");
    const { rows } = worldClock(instant, ["Asia/Kolkata", "Europe/London"]);
    const slots = meetingSlots(instant, "Asia/Kolkata", rows);
    expect(slots).toHaveLength(24);
    expect(slots[0].start.toISOString()).toBe("2026-01-14T18:30:00.000Z");
    // London 09:00 = IST 14:30, so the IST hours 15:00, 16:00 and 17:00 work for both.
    const shared = slots.filter((s) => s.working.length === 2).map((s) => toZonedInputValue(s.start, "Asia/Kolkata").slice(11, 16));
    expect(shared).toEqual(["15:00", "16:00", "17:00"]);
  });
});

describe("helpers", () => {
  it("formats zoned input values and differences", () => {
    expect(toZonedInputValue(new Date("2026-01-15T04:00:00Z"), "Asia/Kolkata")).toBe("2026-01-15T09:30:00");
    expect(formatMinutesDiff(45)).toBe("+45m");
    expect(formatMinutesDiff(-570)).toBe("-9h 30m");
    expect(dayShiftLabel(1)).toBe("next day");
    expect(dayShiftLabel(-2)).toBe("-2 days");
  });

  it("splits pasted lists without breaking multi-word cities", () => {
    expect(splitZonePaste("UTC, new york\nIST;  Europe/London ")).toEqual(["UTC", "new york", "IST", "Europe/London"]);
  });
});
