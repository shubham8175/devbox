import { describe, expect, it } from "vitest";
import { computeRoute, fromKm, parsePoint, ROUTE_SAMPLE, splitPoints } from "@/lib/tools/route";
import { haversineKm } from "@/lib/tools/geo";

describe("parsePoint", () => {
  it("accepts decimal and DMS pairs", () => {
    expect(parsePoint("19.076, 72.8777").point).toEqual({ lat: 19.076, lng: 72.8777 });
    const dms = parsePoint(`19°4'33.6"N 72°52'39.72"E`).point;
    expect(dms?.lat).toBeCloseTo(19.076, 4);
    expect(dms?.lng).toBeCloseTo(72.8777, 4);
    expect(parsePoint("-33.8688, 151.2093").point).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  it("rejects garbage and out-of-range values", () => {
    expect(parsePoint("hello").error).toBeTruthy();
    expect(parsePoint("91, 10").error).toBeTruthy();
    expect(parsePoint("10, 181").error).toBeTruthy();
  });
});

describe("splitPoints", () => {
  it("splits on newlines and semicolons but never on commas", () => {
    expect(splitPoints("1, 2\n3, 4;5, 6\r\n\n")).toEqual(["1, 2", "3, 4", "5, 6"]);
    expect(splitPoints("19.07, 72.87")).toEqual(["19.07, 72.87"]);
  });
});

describe("computeRoute", () => {
  it("builds legs, cumulative and total distance for the sample route", () => {
    const r = computeRoute(ROUTE_SAMPLE);
    expect(r.errors).toEqual([]);
    expect(r.legs).toHaveLength(3);
    expect(r.legs.map((l) => [l.from.line, l.to.line])).toEqual([[1, 2], [2, 3], [3, 4]]);
    const sum = r.legs.reduce((s, l) => s + l.km, 0);
    expect(r.summary?.totalKm).toBeCloseTo(sum, 9);
    expect(r.legs[2].cumulativeKm).toBeCloseTo(sum, 9);
    // Mumbai → Pune is ~120 km as the crow flies.
    expect(r.legs[0].km).toBeGreaterThan(115);
    expect(r.legs[0].km).toBeLessThan(125);
    // Pune → Bengaluru heads south-east.
    expect(r.legs[1].bearing).toBeGreaterThan(90);
    expect(r.legs[1].bearing).toBeLessThan(180);
    expect(r.summary?.directKm).toBeCloseTo(haversineKm({ lat: 19.076, lng: 72.8777 }, { lat: 13.0827, lng: 80.2707 }), 9);
    expect(r.summary!.detour!).toBeGreaterThan(1);
    // Farthest pair is Mumbai ↔ Chennai.
    expect([r.summary?.farthest.a.line, r.summary?.farthest.b.line]).toEqual([1, 4]);
    expect(r.summary?.longestLeg.to.line).toBe(3);
  });

  it("skips empty fields, reports invalid ones and keeps field numbers", () => {
    const r = computeRoute(["0, 0", "", "nope", "0, 1"]);
    expect(r.errors).toEqual([{ line: 3, input: "nope", error: expect.any(String) }]);
    expect(r.legs).toHaveLength(1);
    expect([r.legs[0].from.line, r.legs[0].to.line]).toEqual([1, 4]);
  });

  it("has no summary below two valid points and handles coincident points", () => {
    expect(computeRoute(["0, 0"]).summary).toBeNull();
    const same = computeRoute(["5, 5", "5, 5"]);
    expect(same.legs[0].km).toBe(0);
    expect(same.legs[0].bearing).toBeNull();
    expect(same.summary?.detour).toBeNull();
  });
});

describe("fromKm", () => {
  it("converts to other units", () => {
    expect(fromKm(1.609344, "mi")).toBeCloseTo(1, 9);
    expect(fromKm(1.852, "nmi")).toBeCloseTo(1, 9);
    expect(fromKm(2, "m")).toBe(2000);
  });
});
