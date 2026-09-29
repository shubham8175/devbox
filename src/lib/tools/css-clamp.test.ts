import { describe, expect, it } from "vitest";
import { CLAMP_DEFAULTS, computeClamp, fmt, sizeAtViewport, TYPE_SCALE_RATIOS, typeScale, type ClampInput } from "@/lib/tools/css-clamp";

const ok = (i: ClampInput) => {
  const r = computeClamp(i);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("fmt", () => {
  it("trims trailing zeros and normalises -0", () => {
    expect(fmt(1, 4)).toBe("1");
    expect(fmt(0.86956521, 4)).toBe("0.8696");
    expect(fmt(-0.00001, 4)).toBe("0");
    expect(fmt(2.5, 0)).toBe("3");
    expect(fmt(1 / 3, 99)).toBe("0.33333333");
  });
});

describe("computeClamp", () => {
  it("matches hand-computed values for 16px..24px between 360 and 1280", () => {
    const r = ok(CLAMP_DEFAULTS);
    // slope = 8 / 920 = 0.0086957 px/px -> 0.8696vw; intercept = 16 - slope * 360 = 12.8696px = 0.8043rem
    expect(r.slope).toBeCloseTo(0.0086957, 6);
    expect(r.interceptPx).toBeCloseTo(12.8696, 3);
    expect(r.clampRem).toBe("clamp(1rem, calc(0.8043rem + 0.8696vw), 1.5rem)");
    expect(r.clampPx).toBe("clamp(16px, calc(12.8696px + 0.8696vw), 24px)");
    expect(r.calcFallback).toBe("calc(0.8043rem + 0.8696vw)");
    expect(r.tailwind).toBe("text-[clamp(1rem,calc(0.8043rem_+_0.8696vw),1.5rem)]");
    expect(r.warning).toBeUndefined();
  });

  it("evaluates the size at common viewports, clamped at both ends", () => {
    const r = ok(CLAMP_DEFAULTS);
    expect(r.samples.map((s) => s.viewport)).toEqual([360, 768, 1024, 1280, 1536, 1920]);
    expect(r.samples[0].px).toBe(16);
    expect(r.samples[1].px).toBeCloseTo(19.55, 2);
    expect(r.samples[3].px).toBe(24);
    expect(r.samples[5].px).toBe(24);
    expect(r.samples[5].rem).toBe(1.5);
    expect(sizeAtViewport(CLAMP_DEFAULTS, 100)).toBe(16);
  });

  it("accepts rem inputs and a custom root font size", () => {
    const r = ok({ ...CLAMP_DEFAULTS, unit: "rem", minSize: 1, maxSize: 2, rootFontSize: 10, minViewport: 400, maxViewport: 1400 });
    // 10px..20px over 1000px: slope 0.01 -> 1vw; intercept 10 - 4 = 6px = 0.6rem
    expect(r.clampRem).toBe("clamp(1rem, calc(0.6rem + 1vw), 2rem)");
    expect(r.clampPx).toBe("clamp(10px, calc(6px + 1vw), 20px)");
  });

  it("writes a negative intercept correctly", () => {
    // 16px..48px over 320..640: slope 0.1 -> 10vw; intercept 16 - 32 = -16px = -1rem
    const r = ok({ ...CLAMP_DEFAULTS, minSize: 16, maxSize: 48, minViewport: 320, maxViewport: 640 });
    expect(r.clampRem).toBe("clamp(1rem, calc(-1rem + 10vw), 3rem)");
  });

  it("handles min > max by swapping the bounds and warning", () => {
    const r = ok({ ...CLAMP_DEFAULTS, minSize: 24, maxSize: 16 });
    expect(r.slope).toBeLessThan(0);
    expect(r.clampRem.startsWith("clamp(1rem, ")).toBe(true);
    expect(r.clampRem.endsWith(", 1.5rem)")).toBe(true);
    expect(r.warning).toMatch(/shrinks/);
    expect(r.samples[0].px).toBe(24);
    expect(r.samples[5].px).toBe(16);
  });

  it("warns when min equals max and honours precision", () => {
    const r = ok({ ...CLAMP_DEFAULTS, minSize: 20, maxSize: 20, precision: 2 });
    expect(r.clampRem).toBe("clamp(1.25rem, calc(1.25rem + 0vw), 1.25rem)");
    expect(r.warning).toMatch(/equal/);
  });

  it("rejects equal or reversed viewports and bad numbers", () => {
    const equal = computeClamp({ ...CLAMP_DEFAULTS, minViewport: 800, maxViewport: 800 });
    expect(equal.ok).toBe(false);
    expect(!equal.ok && equal.error).toMatch(/differ/);
    expect(computeClamp({ ...CLAMP_DEFAULTS, minViewport: 1400, maxViewport: 800 }).ok).toBe(false);
    expect(computeClamp({ ...CLAMP_DEFAULTS, minSize: Number.NaN }).ok).toBe(false);
    expect(computeClamp({ ...CLAMP_DEFAULTS, rootFontSize: 0 }).ok).toBe(false);
    expect(computeClamp({ ...CLAMP_DEFAULTS, minSize: -1 }).ok).toBe(false);
    expect(computeClamp({ ...CLAMP_DEFAULTS, maxSize: 1e9 }).ok).toBe(false);
    expect(computeClamp({ ...CLAMP_DEFAULTS, maxViewport: 1e9 }).ok).toBe(false);
  });
});

describe("typeScale", () => {
  it("generates steps -2..5 as custom properties", () => {
    const r = typeScale(CLAMP_DEFAULTS, 1.25);
    if (!r.ok) throw new Error(r.error);
    expect(r.steps.map((s) => s.name)).toEqual(["--step--2", "--step--1", "--step-0", "--step-1", "--step-2", "--step-3", "--step-4", "--step-5"]);
    const base = r.steps.find((s) => s.step === 0);
    expect(base?.clamp).toBe("clamp(1rem, calc(0.8043rem + 0.8696vw), 1.5rem)");
    const up = r.steps.find((s) => s.step === 1);
    expect(up?.minSize).toBe(20);
    expect(up?.maxSize).toBe(30);
    expect(r.steps.find((s) => s.step === -1)?.minSize).toBe(12.8);
    expect(r.css.startsWith(":root {\n  --step--2: clamp(")).toBe(true);
    expect(r.css.endsWith("\n}")).toBe(true);
    expect(r.css.split("\n")).toHaveLength(10);
  });

  it("rejects silly ratios and propagates clamp errors", () => {
    expect(typeScale(CLAMP_DEFAULTS, 1).ok).toBe(false);
    expect(typeScale(CLAMP_DEFAULTS, 5).ok).toBe(false);
    expect(typeScale({ ...CLAMP_DEFAULTS, minViewport: 500, maxViewport: 500 }, 1.2).ok).toBe(false);
    for (const r of TYPE_SCALE_RATIOS) expect(typeScale(CLAMP_DEFAULTS, r.value).ok).toBe(true);
  });
});
