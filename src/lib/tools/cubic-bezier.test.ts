import { describe, expect, it } from "vitest";
import { bezierOutputs, bezierPoint, bezierToTailwind, buildSvgPath, CUBIC_BEZIER_SAMPLE, easingTable, formatBezier, NAMED_CURVES, parseBezier, PRESETS, sampleCurve, solveBezierY, type BezierPoints } from "@/lib/tools/cubic-bezier";

describe("parseBezier", () => {
  it("parses the function form, bare numbers and keywords", () => {
    expect(parseBezier("cubic-bezier(0.25, 0.1, 0.25, 1)")).toEqual({ ok: true, points: [0.25, 0.1, 0.25, 1] });
    expect(parseBezier(" .42,0,.58,1 ")).toEqual({ ok: true, points: [0.42, 0, 0.58, 1] });
    expect(parseBezier("0.4 0 0.2 1")).toEqual({ ok: true, points: [0.4, 0, 0.2, 1] });
    expect(parseBezier("Ease-In-Out")).toEqual({ ok: true, points: NAMED_CURVES["ease-in-out"], name: "ease-in-out" });
    expect(parseBezier(CUBIC_BEZIER_SAMPLE).ok).toBe(true);
  });

  it("allows vertical overshoot but keeps x within 0..1", () => {
    expect(parseBezier("cubic-bezier(0.68, -0.6, 0.32, 1.6)").ok).toBe(true);
    const bad = parseBezier("cubic-bezier(1.2, 0, 0.5, 1)");
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toMatch(/x1 and x2/);
  });

  it("rejects malformed input with a message", () => {
    for (const s of ["", "cubic-bezier(1, 2, 3)", "a, b, c, d", "cubic-bezier(0, 0, 1)", "0,0,1,1,1", "0, 0, 1, 99", "constructor"]) {
      expect(parseBezier(s).ok).toBe(false);
    }
  });
});

describe("curve maths", () => {
  it("formats with trimmed decimals", () => {
    expect(formatBezier([0.25, 0.1, 0.25, 1])).toBe("cubic-bezier(0.25, 0.1, 0.25, 1)");
    expect(formatBezier([0.123456, 0, 1, 1])).toBe("cubic-bezier(0.123, 0, 1, 1)");
  });

  it("bezierPoint hits the end points and the midpoint of a linear curve", () => {
    const lin: BezierPoints = [0, 0, 1, 1];
    expect(bezierPoint(0, lin)).toEqual({ x: 0, y: 0 });
    expect(bezierPoint(1, lin)).toEqual({ x: 1, y: 1 });
    expect(bezierPoint(0.5, lin).x).toBeCloseTo(0.5, 10);
    expect(bezierPoint(0.5, lin).y).toBeCloseTo(0.5, 10);
  });

  it("solveBezierY returns y = x for linear and the known value for ease at 0.5", () => {
    for (const x of [0, 0.1, 0.33, 0.5, 0.9, 1]) expect(solveBezierY(x, [0, 0, 1, 1])).toBeCloseTo(x, 5);
    expect(solveBezierY(0.5, [0.25, 0.1, 0.25, 1])).toBeCloseTo(0.8024, 3);
    expect(solveBezierY(0.5, [0.42, 0, 0.58, 1])).toBeCloseTo(0.5, 5);
    expect(solveBezierY(-1, [0.42, 0, 1, 1])).toBe(0);
    expect(solveBezierY(2, [0.42, 0, 1, 1])).toBe(1);
  });

  it("solves overshooting curves and degenerate flat starts", () => {
    expect(solveBezierY(0.25, [0.68, -0.6, 0.32, 1.6])).toBeLessThan(0);
    expect(solveBezierY(0.75, [0.68, -0.6, 0.32, 1.6])).toBeGreaterThan(1);
    // x1 = x2 = 0 gives a zero derivative at t = 0; bisection must take over.
    expect(solveBezierY(0.5, [0, 0, 0, 1])).toBeGreaterThan(0.5);
  });

  it("builds the easing table with rounded progress", () => {
    const table = easingTable([0, 0, 1, 1]);
    expect(table).toEqual([
      { percent: 0, progress: 0 },
      { percent: 25, progress: 0.25 },
      { percent: 50, progress: 0.5 },
      { percent: 75, progress: 0.75 },
      { percent: 100, progress: 1 },
    ]);
  });

  it("samples the curve and builds an SVG path with inverted y", () => {
    const pts = sampleCurve([0, 0, 1, 1], 4);
    expect(pts).toHaveLength(5);
    expect(pts[2].x).toBeCloseTo(0.5, 10);
    expect(sampleCurve([0, 0, 1, 1], 99999)).toHaveLength(1001);
    expect(buildSvgPath([0.25, 0.1, 0.25, 1], 200)).toBe("M 0 200 C 50 180, 50 0, 200 0");
    expect(buildSvgPath([0.34, 1.56, 0.64, 1], 100)).toBe("M 0 100 C 34 -56, 64 0, 100 0");
  });
});

describe("tailwind and presets", () => {
  it("maps Tailwind's built-in easings and falls back to an arbitrary class", () => {
    expect(bezierToTailwind([0, 0, 1, 1])).toBe("ease-linear");
    expect(bezierToTailwind([0.4, 0, 0.2, 1])).toBe("ease-in-out");
    expect(bezierToTailwind([0.25, 0.1, 0.25, 1])).toBe("ease-[cubic-bezier(0.25,0.1,0.25,1)]");
  });

  it("all presets are valid curves with unique names", () => {
    const names = new Set(PRESETS.map((p) => p.name));
    expect(names.size).toBe(PRESETS.length);
    expect(PRESETS.length).toBeGreaterThanOrEqual(14);
    for (const p of PRESETS) expect(parseBezier(formatBezier(p.points)).ok).toBe(true);
  });

  it("bundles every output string", () => {
    const o = bezierOutputs([0.42, 0, 0.58, 1]);
    expect(o.value).toBe("cubic-bezier(0.42, 0, 0.58, 1)");
    expect(o.transition).toBe("transition: all 300ms cubic-bezier(0.42, 0, 0.58, 1);");
    expect(o.animation).toBe("animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1);");
    expect(o.table[2].progress).toBeCloseTo(0.5, 4);
  });
});
