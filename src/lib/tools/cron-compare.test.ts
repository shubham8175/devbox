import { describe, expect, it } from "vitest";
import { compareCron, CRON_COMPARE_SAMPLE, runRate, splitCronPaste } from "@/lib/tools/cron-compare";
import { explainCron } from "@/lib/tools/cron";

// Cron runs in local time, so build dates from local fields. Mon 2026-01-05 08:50, no DST nearby.
const from = new Date(2026, 0, 5, 8, 50);
const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("compareCron", () => {
  it("merges runs into one timeline tagged with field numbers", () => {
    const r = compareCron(CRON_COMPARE_SAMPLE, from, 6);
    expect(r.errors).toEqual([]);
    expect(r.timeline.map((t) => [hm(t.date), t.lines])).toEqual([
      ["09:00", [1, 2, 3]],
      ["09:15", [2]],
      ["09:30", [2]],
      ["09:45", [2]],
      ["10:00", [1, 2]],
      ["10:15", [2]],
    ]);
  });

  it("counts collisions and run rates over a week", () => {
    const r = compareCron(CRON_COMPARE_SAMPLE, from);
    expect(r.entries.map((e) => e.runsInWindow)).toEqual([168, 672, 5]);
    expect(r.entries.map((e) => runRate(e.runsInWindow))).toEqual(["24/day", "96/day", "5/week"]);
    // Every hour #1 and #2 collide; at 09:00 on the five weekdays all three do.
    expect(r.collisionMinutes).toBe(168);
    expect(r.collisions.map((c) => [c.lines, c.count])).toEqual([
      [[1, 2], 163],
      [[1, 2, 3], 5],
    ]);
    expect(hm(r.collisions[1].next[0])).toBe("09:00");
  });

  it("reports bad expressions by field number and still shows sparse schedules", () => {
    const r = compareCron(["", "0 0 1 1 *", "61 * * * *", "nope"], from, 3);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
    expect(r.errors[0].error).toMatch(/Minute/);
    expect(r.entries[0].runsInWindow).toBe(0);
    expect(r.timeline.map((t) => t.date.getFullYear())).toEqual([2027, 2028, 2029]);
    expect(r.collisions).toEqual([]);
  });
});

describe("helpers", () => {
  it("splits pasted cron lists on newlines only", () => {
    expect(splitCronPaste("0 * * * *\n*/15 * * * *\r\n\n 0 9 * * 1-5 ")).toEqual(CRON_COMPARE_SAMPLE);
  });

  it("keeps explainCron behaviour", () => {
    const r = explainCron("*/15 * * * *", from);
    expect(r.ok).toBe(true);
    expect(r.nextRuns.map(hm)).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00"]);
    expect(explainCron("1 2 3").error).toMatch(/Expected 5 fields/);
  });

  it("formats fractional daily rates", () => {
    expect(runRate(10)).toBe("1.4/day");
  });
});
