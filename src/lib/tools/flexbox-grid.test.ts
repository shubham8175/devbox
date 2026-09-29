import { describe, expect, it } from "vitest";
import { FLEX_DEFAULTS, flexCss, GRID_DEFAULTS, gridCss, LAYOUT_LIMITS, LAYOUT_PRESETS, pxToTailwind } from "@/lib/tools/flexbox-grid";

describe("pxToTailwind", () => {
  it("maps 4px steps, 1px and arbitrary values", () => {
    expect(pxToTailwind("gap", 16)).toBe("gap-4");
    expect(pxToTailwind("gap", 2)).toBe("gap-0.5");
    expect(pxToTailwind("gap", 1)).toBe("gap-px");
    expect(pxToTailwind("gap", 0)).toBe("gap-0");
    expect(pxToTailwind("gap-x", 13)).toBe("gap-x-[13px]");
  });
});

describe("flexCss", () => {
  it("renders the container rule, style object and Tailwind line", () => {
    const out = flexCss({ ...FLEX_DEFAULTS, wrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 });
    expect(out.css).toBe(".container {\n  display: flex;\n  flex-direction: row;\n  flex-wrap: wrap;\n  justify-content: space-between;\n  align-items: center;\n  gap: 16px;\n}");
    expect(out.containerStyle).toEqual({ display: "flex", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", alignContent: undefined, gap: "16px" });
    expect(out.tailwind).toBe("flex flex-row flex-wrap justify-between items-center gap-4");
  });

  it("includes align-content only when set and maps column direction", () => {
    const out = flexCss({ ...FLEX_DEFAULTS, direction: "column", alignContent: "center", gap: 0 });
    expect(out.css).toContain("align-content: center;");
    expect(out.tailwind).toBe("flex flex-col flex-nowrap justify-start items-stretch content-center gap-0");
  });

  it("emits nth-child rules and per-item Tailwind for overrides", () => {
    const out = flexCss({ ...FLEX_DEFAULTS, items: [{ index: 2, grow: 1, shrink: 0, basis: "200px", alignSelf: "center", order: -1 }, { index: 3, grow: 2, order: 3 }] });
    expect(out.css).toContain(".item:nth-child(2) {\n  flex-grow: 1;\n  flex-shrink: 0;\n  flex-basis: 200px;\n  align-self: center;\n  order: -1;\n}");
    expect(out.css).toContain(".item:nth-child(3) {\n  flex-grow: 2;\n  order: 3;\n}");
    expect(out.itemStyles[2]).toEqual({ flexGrow: 1, flexShrink: 0, flexBasis: "200px", alignSelf: "center", order: -1 });
    expect(out.itemTailwind[2]).toBe("grow shrink-0 basis-[200px] self-center order-[-1]");
    expect(out.itemTailwind[3]).toBe("grow-[2] order-3");
  });

  it("ignores overrides outside the item range, empty overrides and clamps inputs", () => {
    const out = flexCss({ ...FLEX_DEFAULTS, itemCount: 99, gap: 9999, items: [{ index: 0, grow: 1 }, { index: 13, grow: 1 }, { index: 1 }, { index: 2, alignSelf: "auto", order: 0 }] });
    expect(out.css).toBe(".container {\n  display: flex;\n  flex-direction: row;\n  flex-wrap: nowrap;\n  justify-content: flex-start;\n  align-items: stretch;\n  gap: 200px;\n}");
    expect(out.tailwind).toContain("gap-[200px]");
    expect(Object.keys(out.itemStyles)).toEqual(["1", "2"]);
    expect(out.itemTailwind[1]).toBe("");
    expect(LAYOUT_LIMITS.maxItems).toBe(12);
  });
});

describe("gridCss", () => {
  it("renders a repeat template with gaps and defaults", () => {
    const out = gridCss({ ...GRID_DEFAULTS, columns: 4, rowGap: 16, columnGap: 16 });
    expect(out.css).toBe(".container {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 16px;\n  justify-items: stretch;\n  align-items: stretch;\n}");
    expect(out.containerStyle.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(out.tailwind).toBe("grid grid-cols-4 gap-4");
  });

  it("supports custom templates, distinct gaps, rows, alignment and auto-flow", () => {
    const out = gridCss({ ...GRID_DEFAULTS, columnsMode: "custom", columnsTemplate: "240px 1fr", rows: 2, rowGap: 8, columnGap: 24, justifyItems: "center", alignItems: "flex-end", justifyContent: "center", alignContent: "space-between", autoFlow: "column dense" });
    expect(out.css).toContain("grid-template-columns: 240px 1fr;");
    expect(out.css).toContain("grid-template-rows: repeat(2, minmax(0, 1fr));");
    expect(out.css).toContain("gap: 8px 24px;");
    expect(out.css).toContain("grid-auto-flow: column dense;");
    expect(out.tailwind).toBe("grid grid-cols-[240px_1fr] grid-rows-2 gap-x-6 gap-y-2 justify-items-center items-end justify-center content-between grid-flow-col-dense");
  });

  it("emits spans for items and clamps them", () => {
    const out = gridCss({ ...GRID_DEFAULTS, items: [{ index: 1, colSpan: 2, rowSpan: 3 }, { index: 2, colSpan: 1 }, { index: 3, colSpan: 99 }] });
    expect(out.css).toContain(".item:nth-child(1) {\n  grid-column: span 2 / span 2;\n  grid-row: span 3 / span 3;\n}");
    expect(out.css).not.toContain("nth-child(2)");
    expect(out.itemTailwind[1]).toBe("col-span-2 row-span-3");
    expect(out.itemTailwind[3]).toBe("col-span-12");
    expect(out.itemStyles[1]).toEqual({ gridColumn: "span 2 / span 2", gridRow: "span 3 / span 3" });
  });

  it("falls back to repeat when the custom template is blank", () => {
    const out = gridCss({ ...GRID_DEFAULTS, columnsMode: "custom", columnsTemplate: "   ", columns: 2 });
    expect(out.css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(out.tailwind).toContain("grid-cols-2");
  });
});

describe("presets", () => {
  it("every preset produces CSS in its own mode", () => {
    for (const p of LAYOUT_PRESETS) {
      const out = p.mode === "flex" ? flexCss(p.flex ?? FLEX_DEFAULTS) : gridCss(p.grid ?? GRID_DEFAULTS);
      expect(out.css.startsWith(".container {")).toBe(true);
      expect(out.tailwind.startsWith(p.mode)).toBe(true);
    }
    const holy = LAYOUT_PRESETS.find((p) => p.name === "Holy grail");
    expect(holy && gridCss(holy.grid ?? GRID_DEFAULTS).css).toContain("grid-template-rows: auto 1fr auto;");
  });
});
