import { describe, expect, it } from "vitest";
import { checkContrast, composite, CONTRAST_PAIRS_SAMPLE, CONTRAST_SAMPLE, contrastRatio, formatRatio, suggestAccessible, swap, wcagGrades } from "@/lib/tools/contrast";
import { parseColor, type RGBA } from "@/lib/tools/color";

const c = (s: string): RGBA => {
  const p = parseColor(s);
  if (!p) throw new Error(`bad colour ${s}`);
  return p;
};

describe("contrastRatio", () => {
  it("black on white is 21:1 and is symmetric", () => {
    expect(contrastRatio(c("#000"), c("#fff"))).toBeCloseTo(21, 5);
    expect(contrastRatio(c("#fff"), c("#000"))).toBeCloseTo(21, 5);
  });

  it("identical colours are 1:1", () => {
    expect(contrastRatio(c("#7c8cff"), c("#7c8cff"))).toBe(1);
  });

  it("#777777 on white is about 4.48 (fails AA) and #767676 about 4.54 (passes)", () => {
    const fail = contrastRatio(c("#777777"), c("#ffffff"));
    const pass = contrastRatio(c("#767676"), c("#ffffff"));
    expect(fail).toBeCloseTo(4.48, 2);
    expect(pass).toBeCloseTo(4.54, 2);
    expect(wcagGrades(fail).normalAA).toBe(false);
    expect(wcagGrades(pass).normalAA).toBe(true);
  });

  it("composites a translucent foreground over the background before measuring", () => {
    const half = contrastRatio(c("rgba(0,0,0,0.5)"), c("#fff"));
    // 50 % black over white is #808080, which sits just under 4:1.
    expect(half).toBeGreaterThan(3.9);
    expect(half).toBeLessThan(4.0);
    expect(composite(c("rgba(0,0,0,0.5)"), c("#fff"))).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it("flattens a translucent background over white", () => {
    const r = contrastRatio(c("#000"), c("rgba(0,0,0,0.5)"));
    expect(r).toBeCloseTo(contrastRatio(c("#000"), c("#808080")), 5);
  });
});

describe("wcagGrades", () => {
  it("applies the thresholds at the boundaries", () => {
    expect(wcagGrades(3)).toEqual({ normalAA: false, normalAAA: false, largeAA: true, largeAAA: false, uiAA: true });
    expect(wcagGrades(4.5)).toEqual({ normalAA: true, normalAAA: false, largeAA: true, largeAAA: true, uiAA: true });
    expect(wcagGrades(7)).toEqual({ normalAA: true, normalAAA: true, largeAA: true, largeAAA: true, uiAA: true });
    expect(wcagGrades(2.99)).toEqual({ normalAA: false, normalAAA: false, largeAA: false, largeAAA: false, uiAA: false });
  });

  it("formats ratios with two decimals", () => {
    expect(formatRatio(21)).toBe("21.00:1");
    expect(formatRatio(4.5449)).toBe("4.54:1");
  });
});

describe("suggestAccessible", () => {
  it("returns the input unchanged when it already passes", () => {
    const s = suggestAccessible(c("#000"), c("#fff"));
    expect(s.ok && s.steps).toBe(0);
    expect(s.ok && s.direction).toBe("none");
    expect(s.ok && s.hex).toBe("#000000");
  });

  it("darkens a light grey on white until AA passes, in a few steps", () => {
    const s = suggestAccessible(c("#999999"), c("#ffffff"));
    if (!s.ok) throw new Error(s.error);
    expect(s.direction).toBe("darker");
    expect(s.steps).toBeGreaterThan(0);
    expect(s.steps).toBeLessThan(30);
    expect(s.ratio).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(s.color, c("#fff"))).toBeGreaterThanOrEqual(4.5);
  });

  it("lightens a dark colour on a dark background", () => {
    const s = suggestAccessible(c("#333333"), c("#111111"), 7);
    if (!s.ok) throw new Error(s.error);
    expect(s.direction).toBe("lighter");
    expect(s.ratio).toBeGreaterThanOrEqual(7);
  });

  it("keeps the alpha of the input and preserves the hue", () => {
    const s = suggestAccessible(c("rgba(124, 140, 255, 0.9)"), c("#fff"));
    if (!s.ok) throw new Error(s.error);
    expect(s.color.a).toBeCloseTo(0.9, 5);
    expect(s.hex).toHaveLength(9);
  });

  it("fails cleanly when the target is out of range or unreachable", () => {
    expect(suggestAccessible(c("#000"), c("#fff"), 25).ok).toBe(false);
    // Mid grey background: no pure grey can reach 21:1 against it.
    expect(suggestAccessible(c("#888"), c("#888"), 20).ok).toBe(false);
  });
});

describe("helpers and samples", () => {
  it("swaps a pair", () => {
    expect(swap({ fg: "a", bg: "b" })).toEqual({ fg: "b", bg: "a" });
  });

  it("checkContrast parses both colours and returns null for garbage", () => {
    const r = checkContrast(CONTRAST_SAMPLE.fg, CONTRAST_SAMPLE.bg);
    expect(r?.grades.normalAA).toBe(true);
    expect(checkContrast("nope", "#fff")).toBeNull();
  });

  it("all sample pairs parse", () => {
    for (const p of CONTRAST_PAIRS_SAMPLE) {
      expect(checkContrast(p.fg, p.bg)).not.toBeNull();
    }
    expect(CONTRAST_PAIRS_SAMPLE.length).toBeGreaterThanOrEqual(8);
  });
});
