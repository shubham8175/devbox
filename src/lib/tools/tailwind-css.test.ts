import { describe, expect, it } from "vitest";
import { CSS_TO_TAILWIND_SAMPLE, cssToTailwind, TAILWIND_CSS_SAMPLE, TAILWIND_LIMITS, tailwindToCss } from "@/lib/tools/tailwind-css";
import { COLORS, SPACING } from "@/lib/tools/tailwind-data";

const decls = (classes: string, opts?: Parameters<typeof tailwindToCss>[1]) => {
  const r = tailwindToCss(classes, opts);
  return r.blocks.flatMap((b) => b.declarations.map((d) => `${b.media ? `@${b.media} ` : ""}${b.selector} ${d.property}: ${d.value}`));
};

describe("tailwindToCss: spacing and sizing", () => {
  it("maps the spacing scale, px, fractions and named sizes", () => {
    expect(decls("p-4 px-2.5 mt-px w-1/2 h-screen max-w-md min-w-0 basis-1/3")).toEqual([
      ".element padding: 1rem",
      ".element padding-left: 0.625rem",
      ".element padding-right: 0.625rem",
      ".element margin-top: 1px",
      ".element width: 50%",
      ".element height: 100vh",
      ".element max-width: 28rem",
      ".element min-width: 0px",
      ".element flex-basis: 33.333333%",
    ]);
    expect(decls("size-8")).toEqual([".element width: 2rem", ".element height: 2rem"]);
  });

  it("lets a later utility override the same property", () => {
    expect(decls("p-4 p-6 w-1/2 size-8")).toEqual([".element padding: 1.5rem", ".element width: 2rem", ".element height: 2rem"]);
  });

  it("supports negative margins, insets and translates", () => {
    expect(decls("-m-4 -top-1/2 -translate-x-1/2 -rotate-45 -z-10")).toEqual([".element margin: -1rem", ".element top: -50%", ".element transform: translateX(-50%)", ".element transform: rotate(-45deg)", ".element z-index: -10"]);
  });

  it("accepts arbitrary values and arbitrary properties", () => {
    expect(decls("w-[13px] grid-cols-[1fr_2fr] bg-[#123456] text-[15px] [mask-type:luminance]")).toEqual([
      ".element width: 13px",
      ".element grid-template-columns: 1fr 2fr",
      ".element background-color: #123456",
      ".element font-size: 15px",
      ".element mask-type: luminance",
    ]);
  });

  it("converts rem to px when asked", () => {
    expect(decls("p-4 text-sm", { unit: "px", rem: 16 })).toEqual([".element padding: 16px", ".element font-size: 14px", ".element line-height: 20px"]);
  });
});

describe("tailwindToCss: colours, typography, borders, effects", () => {
  it("uses the default palette and applies opacity modifiers", () => {
    expect(decls("bg-red-500 text-white/80 border-slate-200 ring-blue-500 from-indigo-500")).toEqual([
      ".element background-color: #ef4444",
      ".element color: rgb(255 255 255 / 0.8)",
      ".element border-color: #e2e8f0",
      ".element --tw-ring-color: #3b82f6",
      ".element --tw-gradient-from: #6366f1",
    ]);
    expect(decls("bg-red-500/50")).toEqual([".element background-color: rgb(239 68 68 / 0.5)"]);
    expect(Object.keys(COLORS).length).toBe(22 * 11 + 5);
  });

  it("handles font sizes with line-height, weights, families and text helpers", () => {
    expect(decls("text-lg font-bold font-mono leading-6 tracking-tight truncate text-center uppercase")).toEqual([
      ".element font-size: 1.125rem",
      ".element line-height: 1.5rem",
      ".element font-weight: 700",
      expect.stringMatching(/^\.element font-family: ui-monospace/),
      ".element letter-spacing: -0.025em",
      ".element overflow: hidden",
      ".element text-overflow: ellipsis",
      ".element white-space: nowrap",
      ".element text-align: center",
      ".element text-transform: uppercase",
    ]);
  });

  it("distinguishes border widths, styles and colours; rounded sides and corners", () => {
    expect(decls("border border-2 border-x-4 border-dashed rounded-xl rounded-t-lg rounded-br-none")).toEqual([
      ".element border-width: 2px",
      ".element border-left-width: 4px",
      ".element border-right-width: 4px",
      ".element border-style: dashed",
      ".element border-radius: 0.75rem",
      ".element border-top-left-radius: 0.5rem",
      ".element border-top-right-radius: 0.5rem",
      ".element border-bottom-right-radius: 0px",
    ]);
  });

  it("emits real shadow values, transitions, transforms and rings", () => {
    const d = decls("shadow-md transition-colors duration-300 ease-in-out scale-105 ring-2 opacity-50 blur-sm");
    expect(d).toContain(".element box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)");
    expect(d).toContain(".element transition-property: color, background-color, border-color, text-decoration-color, fill, stroke");
    expect(d).toContain(".element transition-duration: 300ms");
    expect(d).toContain(".element transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)");
    expect(d).toContain(".element transform: scale(1.05)");
    expect(d).toContain(".element opacity: 0.5");
    expect(d).toContain(".element filter: blur(4px)");
    expect(d.some((x) => x.startsWith(".element box-shadow: 0 0 0 2px"))).toBe(true);
  });

  it("renders space-x and divide-y with the sibling selector", () => {
    const r = tailwindToCss("space-x-4 divide-y");
    expect(r.blocks[0].selector).toBe(".element > :not([hidden]) ~ :not([hidden])");
    expect(r.blocks[0].declarations).toEqual([
      { property: "margin-left", value: "1rem" },
      { property: "border-top-width", value: "1px" },
      { property: "border-bottom-width", value: "0px" },
    ]);
    expect(r.notes.some((n) => n.includes("space-x"))).toBe(true);
  });
});

describe("tailwindToCss: variants and grouping", () => {
  it("groups by selector and media, in the right wrappers", () => {
    const r = tailwindToCss("p-4 hover:bg-red-500 md:p-6 md:hover:p-8 dark:bg-slate-900 group-hover:text-white first:mt-0 !m-0");
    expect(r.blocks.map((b) => [b.media ?? "", b.selector])).toEqual([
      ["", ".element"],
      ["", ".element:hover"],
      ["", ".group:hover .element"],
      ["", ".element:first-child"],
      ["(min-width: 768px)", ".element"],
      ["(min-width: 768px)", ".element:hover"],
      ["(prefers-color-scheme: dark)", ".element"],
    ]);
    expect(r.blocks[0].declarations).toEqual([
      { property: "padding", value: "1rem" },
      { property: "margin", value: "0px !important" },
    ]);
    expect(r.blocks[0].from).toEqual(["p-4", "!m-0"]);
    expect(r.css).toContain("@media (min-width: 768px) {\n  .element {\n    padding: 1.5rem;\n  }\n\n  .element:hover {\n    padding: 2rem;\n  }\n}");
    expect(r.css.startsWith(".element {\n  padding: 1rem;\n  margin: 0px !important;\n}")).toBe(true);
  });

  it("supports the v4 trailing-bang important syntax and a custom selector", () => {
    const r = tailwindToCss("p-4!", { selector: ".card" });
    expect(r.css).toBe(".card {\n  padding: 1rem !important;\n}");
  });

  it("expands container into breakpoint max-widths", () => {
    const r = tailwindToCss("container");
    expect(r.blocks).toHaveLength(6);
    expect(r.blocks[5]).toEqual({ selector: ".element", media: "(min-width: 1536px)", declarations: [{ property: "max-width", value: "1536px" }], from: ["container"] });
  });

  it("reports unknown classes and variants without throwing", () => {
    const r = tailwindToCss("flex nope-4 bg-notacolor md:wat data-[x]:p-4 p-constructor __proto__ hover:");
    expect(r.unknown).toEqual(["nope-4", "bg-notacolor", "md:wat", "data-[x]:p-4", "p-constructor", "__proto__", "hover:"]);
    expect(r.blocks[0].declarations).toEqual([{ property: "display", value: "flex" }]);
  });

  it("translates the sample and caps the number of classes", () => {
    const r = tailwindToCss(TAILWIND_CSS_SAMPLE);
    expect(r.unknown).toEqual([]);
    expect(r.blocks.length).toBe(4);
    const many = Array.from({ length: TAILWIND_LIMITS.maxClasses + 50 }, (_, i) => `p-${i}`).join(" ");
    expect(() => tailwindToCss(many)).not.toThrow();
  });
});

describe("cssToTailwind", () => {
  it("maps exact declarations, multi-declaration utilities and colours by hex", () => {
    const r = cssToTailwind("display: flex; align-items: center; padding-left: 1rem; padding-right: 1rem; color: #ef4444; background-color: rgb(255 255 255 / 0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;");
    expect(r.classes).toEqual(["flex", "items-center", "px-4", "text-red-500", "bg-white/80", "truncate"]);
    expect(r.unmapped).toEqual([]);
  });

  it("accepts a whole rule, expands shorthands and snaps px values", () => {
    const r = cssToTailwind(CSS_TO_TAILWIND_SAMPLE);
    expect(r.classes).toEqual(expect.arrayContaining(["flex", "items-center", "justify-between", "gap-4", "py-4", "px-6", "rounded-xl", "bg-white", "text-slate-900", "shadow-md", "mt-4", "w-9", "border", "border-solid", "border-slate-200"]));
    expect(r.unmapped).toEqual([]);
    expect(r.notes.some((n) => n.startsWith("margin-top: 15px"))).toBe(true);
    expect(r.notes.some((n) => n.startsWith("width: 37px"))).toBe(true);
    expect(r.notes.some((n) => n.includes("Selectors"))).toBe(true);
  });

  it("falls back to arbitrary values, partial matches and !important", () => {
    const r = cssToTailwind("background-color: #123456; width: 900px; font-size: 1rem; z-index: 999 !important; transition: opacity 200ms ease-in;");
    expect(r.classes).toEqual(expect.arrayContaining(["bg-[#123456]", "w-[900px]", "text-base", "!z-[999]", "transition-opacity", "duration-200", "ease-in"]));
    expect(r.notes.some((n) => n.startsWith("text-base also sets line-height"))).toBe(true);
  });

  it("reports declarations it cannot map and ignores garbage", () => {
    const r = cssToTailwind("content: ''; --my-var: 3; nonsense; :bad; flex: 1;");
    expect(r.classes).toEqual(["flex-1"]);
    expect(r.unmapped).toEqual([
      { property: "content", value: "''" },
      { property: "--my-var", value: "3" },
    ]);
  });

  it("caps declarations and never throws on hostile input", () => {
    const big = Array.from({ length: TAILWIND_LIMITS.maxDeclarations + 20 }, (_, i) => `padding: ${i}px`).join(";");
    expect(() => cssToTailwind(big)).not.toThrow();
    expect(() => cssToTailwind("{{{{}}}} @media { } __proto__: 1; constructor: x;")).not.toThrow();
    expect(Object.keys(SPACING)).toContain("96");
  });
});
