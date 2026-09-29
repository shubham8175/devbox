import { describe, expect, it } from "vitest";
import { ATTR_MAP, DEFAULT_SVG_OPTIONS, SVG_SAMPLE, jsxAttrName, minifyStyle, optimizeSvg, parseXml, roundNumberString, serializeXml, svgToJsx, type SvgOptimizeOptions } from "@/lib/tools/svg";

const NONE: SvgOptimizeOptions = { ...DEFAULT_SVG_OPTIONS, removeComments: false, removeMetadata: false, removeEditorNamespaces: false, removeXmlDeclaration: false, removeDefaults: false, removeEmptyGroups: false, collapseWhitespace: false, roundNumbers: false, removeIds: false, minifyStyles: false, removeDimensions: false };

function opt(svg: string, o: Partial<SvgOptimizeOptions>) {
  const r = optimizeSvg(svg, { ...NONE, ...o });
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("parseXml / serializeXml", () => {
  it("round-trips elements, attributes, comments, cdata, pi and doctype", () => {
    const src = `<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd"><!-- c --><svg xmlns="http://www.w3.org/2000/svg" viewBox='0 0 1 1'><style><![CDATA[.a{fill:red}]]></style><g><path d="M0 0"/></g><text>hi &amp; bye</text></svg>`;
    const r = parseXml(src);
    expect(r.ok).toBe(true);
    if (r.ok) expect(serializeXml(r.nodes)).toBe(src.replace("viewBox='0 0 1 1'", 'viewBox="0 0 1 1"'));
  });

  it("reports malformed input with line numbers", () => {
    expect(parseXml("<svg>\n<g>\n</svg>")).toMatchObject({ ok: false, error: expect.stringMatching(/Line 3: expected <\/g>/) });
    expect(parseXml("<svg><g>")).toMatchObject({ ok: false, error: expect.stringMatching(/never closed/) });
    expect(parseXml("<svg></g>")).toMatchObject({ ok: false, error: expect.stringMatching(/expected <\/svg>/) });
    expect(parseXml("<svg a=\"x></svg>")).toMatchObject({ ok: false, error: expect.stringMatching(/unterminated value/) });
    expect(parseXml("<!-- never")).toMatchObject({ ok: false });
    expect(parseXml("<svg".padEnd(2_000_001, " "))).toMatchObject({ ok: false, error: expect.stringMatching(/larger/) });
  });

  it("tolerates unquoted and valueless attributes", () => {
    const r = parseXml("<svg width=10 hidden/>");
    expect(r.ok && r.nodes[0].type === "element" && r.nodes[0].attrs).toEqual([{ name: "width", value: "10" }, { name: "hidden", value: "" }]);
  });
});

describe("optimizeSvg steps", () => {
  it("rejects empty input and non-svg roots", () => {
    expect(optimizeSvg("")).toMatchObject({ ok: false });
    expect(optimizeSvg("<div/>")).toMatchObject({ ok: false, error: expect.stringMatching(/not <svg>/) });
  });

  it("removes comments, xml declaration and metadata (optionally keeping title)", () => {
    const src = `<?xml version="1.0"?><svg><title>T</title><desc>D</desc><metadata>m</metadata><!-- c --><g/></svg>`;
    expect(opt(src, { removeComments: true }).svg).toBe(`<?xml version="1.0"?><svg><title>T</title><desc>D</desc><metadata>m</metadata><g/></svg>`);
    expect(opt(src, { removeXmlDeclaration: true }).svg.startsWith("<svg")).toBe(true);
    expect(opt(src, { removeMetadata: true }).svg).toBe(`<?xml version="1.0"?><svg><!-- c --><g/></svg>`);
    expect(opt(src, { removeMetadata: true, keepTitle: true }).svg).toContain("<title>T</title>");
  });

  it("removes editor elements, attributes and unused namespace declarations, but keeps used ones", () => {
    const src = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="i" xmlns:sodipodi="s" xmlns:svg="x"><sodipodi:namedview id="n"/><g inkscape:label="L"><use xlink:href="#a"/></g></svg>`;
    const r = opt(src, { removeEditorNamespaces: true });
    expect(r.svg).toBe(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g><use xlink:href="#a"/></g></svg>`);
    expect(r.steps[0]).toMatch(/editor-specific/);
  });

  it("removes only unreferenced ids", () => {
    const src = `<svg><defs><linearGradient id="grad"/><clipPath id="clip"/><filter id="f"/><path id="p"/><g id="anim"/></defs><style>#styled{}</style><rect id="styled" fill="url(#grad)" style="filter:url( '#f' )"/><rect id="unused" clip-path="url(#clip)"/><use href="#p"/><animate begin="anim.click"/></svg>`;
    const r = opt(src, { removeIds: true });
    for (const kept of ["grad", "clip", "f", "p", "anim", "styled"]) expect(r.svg).toContain(`id="${kept}"`);
    expect(r.svg).not.toContain('id="unused"');
    expect(r.steps[0]).toMatch(/1 unreferenced id/);
  });

  it("removes true no-op defaults only when no ancestor overrides them", () => {
    const src = `<svg version="1.1"><g fill-rule="nonzero" opacity="1"><rect x="0" y="0" rx="0" stroke="none"/></g><g fill-rule="evenodd"><path fill-rule="nonzero"/></g><text x="0">t</text><ellipse rx="0"/></svg>`;
    const r = opt(src, { removeDefaults: true });
    expect(r.svg).toBe(`<svg><g><rect/></g><g fill-rule="evenodd"><path fill-rule="nonzero"/></g><text x="0">t</text><ellipse rx="0"/></svg>`);
  });

  it("removes empty groups recursively and collapses whitespace outside text", () => {
    const src = `<svg>\n  <g>\n    <g></g>\n  </g>\n  <defs/>\n  <text>  keep   this </text>\n  <g><path d="M0 0"/></g>\n</svg>\n`;
    const r = opt(src, { removeEmptyGroups: true, collapseWhitespace: true });
    expect(r.svg).toBe(`<svg><text>  keep   this </text><g><path d="M0 0"/></g></svg>`);
  });

  it("rounds numbers in numeric attributes and path data but never in ids or urls", () => {
    expect(roundNumberString("1.00000 -0.0001 2.5e-7 10", 3)).toBe("1 0 0 10");
    const src = `<svg viewBox="0 0 24.000001 24.000001" transform="translate( 1.23456 , 2 )"><path id="p1.23456" d="M 13.000001,2.0000004 L 3,14.000001 h -1.4999996 z" fill="url(#g1.5)"/><circle cx="12.000000001" r="0.0000001"/></svg>`;
    const r = opt(src, { roundNumbers: true, precision: 3 });
    expect(r.svg).toBe(`<svg viewBox="0 0 24 24" transform="translate(1.235,2)"><path id="p1.23456" d="M13,2L3,14h-1.5z" fill="url(#g1.5)"/><circle cx="12" r="0"/></svg>`);
  });

  it("minifies style attributes and <style> content", () => {
    expect(minifyStyle(" fill : red ;  stroke-width:1.5 ; ; ")).toBe("fill:red;stroke-width:1.5");
    const r = opt(`<svg><style>\n .a {\n  fill: red;\n }\n</style><path style=" fill : red ; "/></svg>`, { minifyStyles: true });
    expect(r.svg).toBe(`<svg><style>.a{fill:red}</style><path style="fill:red"/></svg>`);
  });

  it("removeDimensions keeps or synthesises the viewBox", () => {
    expect(opt(`<svg width="24px" height="24" viewBox="0 0 24 24"/>`, { removeDimensions: true }).svg).toBe(`<svg viewBox="0 0 24 24"/>`);
    expect(opt(`<svg width="24px" height="16"/>`, { removeDimensions: true }).svg).toBe(`<svg viewBox="0 0 24 16"/>`);
    expect(opt(`<svg width="100%" height="16"/>`, { removeDimensions: true }).svg).toBe(`<svg width="100%" height="16"/>`);
  });

  it("optimizes the sample substantially and reports sizes", () => {
    const r = optimizeSvg(SVG_SAMPLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.after).toBeLessThan(r.before / 2);
    expect(r.savedPercent).toBeGreaterThan(50);
    expect(r.svg).not.toMatch(/inkscape|sodipodi|<!--|<\?xml|metadata|<title>/);
    expect(r.svg).toContain('id="grad"');
    expect(r.svg).toContain("url(#grad)");
    expect(r.svg).not.toContain('id="path1"');
    expect(r.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(r.svg).not.toContain("xmlns:xlink");
    expect(r.steps.length).toBeGreaterThan(5);
  });
});

describe("svgToJsx", () => {
  it("maps every presentation attribute to camelCase and keeps data-/aria-", () => {
    const expected: Record<string, string> = { "stroke-width": "strokeWidth", "fill-rule": "fillRule", "clip-path": "clipPath", "stroke-linecap": "strokeLinecap", "font-family": "fontFamily", "color-interpolation-filters": "colorInterpolationFilters", "marker-end": "markerEnd", "stop-color": "stopColor", "text-anchor": "textAnchor", "vector-effect": "vectorEffect", "paint-order": "paintOrder", "dominant-baseline": "dominantBaseline", "letter-spacing": "letterSpacing", "panose-1": "panose1", "v-alphabetic": "vAlphabetic", "x-height": "xHeight", "glyph-orientation-horizontal": "glyphOrientationHorizontal" };
    for (const [k, v] of Object.entries(expected)) expect(ATTR_MAP[k]).toBe(v);
    for (const [k, v] of Object.entries(ATTR_MAP)) expect(v).toBe(k.startsWith("xlink:") || k.startsWith("xml") ? v : v.replace(/-/g, ""));
    expect(jsxAttrName("class")).toBe("className");
    expect(jsxAttrName("xlink:href")).toBe("xlinkHref");
    expect(jsxAttrName("xmlns:xlink")).toBe("xmlnsXlink");
    expect(jsxAttrName("xml:space")).toBe("xmlSpace");
    expect(jsxAttrName("viewbox")).toBe("viewBox");
    expect(jsxAttrName("viewBox")).toBe("viewBox");
    expect(jsxAttrName("data-icon")).toBe("data-icon");
    expect(jsxAttrName("aria-hidden")).toBe("aria-hidden");
    expect(jsxAttrName("tabindex")).toBe("tabIndex");
    expect(jsxAttrName("unknown-attr")).toBe("unknownAttr");
  });

  it("produces a typed default-export component with the props spread on the root", () => {
    const r = svgToJsx(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="ic"><!-- c --><path d="M0 0h24" stroke-width="2"/></svg>`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fileName).toBe("Icon.tsx");
    expect(r.code).toBe(['import type { SVGProps } from "react";', "", "export default function Icon(props: SVGProps<SVGSVGElement>) {", "  return (", '    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="ic" {...props}>', '      <path d="M0 0h24" strokeWidth="2" />', "    </svg>", "  );", "}", ""].join("\n"));
  });

  it("supports JS output, named exports, custom names and size props", () => {
    const r = svgToJsx(`<svg width="32" height="16"><rect/></svg>`, { typescript: false, exportDefault: false, componentName: "logo mark", sizeProps: true });
    expect(r.ok && r.code).toContain('export function Icon({ width = "32", height = "16", ...props }) {');
    const named = svgToJsx(`<svg/>`, { typescript: false, exportDefault: false, componentName: "logoMark", sizeProps: true });
    expect(named.ok && named.code).toContain("export function LogoMark({ width = \"24\", height = \"24\", ...props }) {");
    expect(named.ok && named.code).toContain("<svg width={width} height={height} {...props} />");
    expect(named.ok && named.fileName).toBe("LogoMark.jsx");
  });

  it("converts style attributes to objects and escapes tricky text", () => {
    const r = svgToJsx(`<svg><path style="fill:  red; stroke-width : 2px; -webkit-mask: none; --x: 1"/><text>a {b} &amp; "q"</text><title>T</title><style>.a { fill: red }</style><g><text>x</text> tail</g></svg>`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toContain('style={{ fill: "red", strokeWidth: "2px", WebkitMask: "none", "--x": "1" }}');
    expect(r.code).toContain('<text>{"a {b} &amp; \\"q\\""}</text>');
    expect(r.code).toContain("<title>T</title>");
    expect(r.code).toContain('<style>{".a { fill: red }"}</style>');
    expect(r.code).toContain("      tail");
  });

  it("replaces a single colour with currentColor, but leaves multi-colour art alone", () => {
    const one = svgToJsx(`<svg><path fill="#111" stroke="none"/><circle style="stroke:#111;fill:url(#g)" stroke="currentColor"/></svg>`, { currentColor: true });
    expect(one.ok && one.code).toContain('fill="currentColor" stroke="none"');
    expect(one.ok && one.code).toContain('style={{ stroke: "currentColor", fill: "url(#g)" }}');
    const two = svgToJsx(`<svg><path fill="#111"/><path fill="#eee"/></svg>`, { currentColor: true });
    expect(two.ok && two.code).toContain('fill="#111"');
  });

  it("reports parse errors and non-svg roots", () => {
    expect(svgToJsx("")).toMatchObject({ ok: false });
    expect(svgToJsx("<svg><g></svg>")).toMatchObject({ ok: false });
    expect(svgToJsx("<html/>")).toMatchObject({ ok: false, error: expect.stringMatching(/not <svg>/) });
  });

  it("converts the sample", () => {
    const r = svgToJsx(SVG_SAMPLE, { currentColor: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).not.toMatch(/inkscape|sodipodi|xmlnsSvg|xmlnsXlink/);
    const used = svgToJsx(`<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/></svg>`);
    expect(used.ok && used.code).toContain('xmlnsXlink="http://www.w3.org/1999/xlink"');
    expect(used.ok && used.code).toContain('<use xlinkHref="#a" />');
    expect(r.code).not.toContain("<!--");
    expect(r.code).toContain("<title>Bolt</title>");
  });
});
