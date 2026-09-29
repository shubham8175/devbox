/**
 * SVG optimizer and SVG → JSX converter. Dependency-free and DOM-free: a small
 * XML parser builds a tree, transforms run on the tree, and a serializer
 * writes it back. Nothing here can execute scripts; the UI previews the
 * result through an <img> data URL for the same reason.
 */

export const MAX_SVG_CHARS = 2_000_000;

export interface XmlAttr {
  name: string;
  value: string;
}

export type XmlNode =
  | { type: "element"; tag: string; attrs: XmlAttr[]; children: XmlNode[] }
  | { type: "text"; value: string }
  | { type: "cdata"; value: string }
  | { type: "comment"; value: string }
  | { type: "pi"; value: string }
  | { type: "doctype"; value: string };

export type XmlElement = Extract<XmlNode, { type: "element" }>;

/* ---------------------------------- parser ---------------------------------- */

const NAME_RE = /^[A-Za-z_:][\w:.-]*/;

export function parseXml(src: string): { ok: true; nodes: XmlNode[] } | { ok: false; error: string } {
  if (src.length > MAX_SVG_CHARS) return { ok: false, error: `Input is larger than ${MAX_SVG_CHARS / 1_000_000} MB.` };
  const root: XmlNode[] = [];
  const stack: Array<{ el: XmlElement; line: number }> = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  const push = (node: XmlNode) => (stack.length ? stack[stack.length - 1].el.children : root).push(node);
  const countLines = (s: string) => {
    for (let k = s.indexOf("\n"); k !== -1; k = s.indexOf("\n", k + 1)) line++;
  };

  while (i < n) {
    if (src[i] !== "<") {
      const end = src.indexOf("<", i);
      const text = src.slice(i, end === -1 ? n : end);
      push({ type: "text", value: text });
      countLines(text);
      i = end === -1 ? n : end;
      continue;
    }
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      if (end === -1) return { ok: false, error: `Line ${line}: unterminated comment.` };
      const value = src.slice(i + 4, end);
      push({ type: "comment", value });
      countLines(value);
      i = end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i + 9);
      if (end === -1) return { ok: false, error: `Line ${line}: unterminated CDATA section.` };
      const value = src.slice(i + 9, end);
      push({ type: "cdata", value });
      countLines(value);
      i = end + 3;
      continue;
    }
    if (src.startsWith("<?", i)) {
      const end = src.indexOf("?>", i + 2);
      if (end === -1) return { ok: false, error: `Line ${line}: unterminated processing instruction.` };
      const value = src.slice(i + 2, end);
      push({ type: "pi", value });
      countLines(value);
      i = end + 2;
      continue;
    }
    if (src.startsWith("<!", i)) {
      // DOCTYPE, possibly with an internal subset in [ ... ].
      let depth = 0;
      let k = i + 2;
      while (k < n) {
        const c = src[k];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth <= 0) break;
        k++;
      }
      if (k >= n) return { ok: false, error: `Line ${line}: unterminated <!DOCTYPE>.` };
      const value = src.slice(i + 2, k);
      push({ type: "doctype", value });
      countLines(value);
      i = k + 1;
      continue;
    }
    if (src.startsWith("</", i)) {
      const end = src.indexOf(">", i + 2);
      if (end === -1) return { ok: false, error: `Line ${line}: unterminated closing tag.` };
      const tag = src.slice(i + 2, end).trim();
      const top = stack.pop();
      if (!top) return { ok: false, error: `Line ${line}: closing tag </${tag}> without an open element.` };
      if (top.el.tag !== tag) return { ok: false, error: `Line ${line}: expected </${top.el.tag}> (opened on line ${top.line}) but found </${tag}>.` };
      i = end + 1;
      continue;
    }
    // Opening tag.
    const nameMatch = NAME_RE.exec(src.slice(i + 1, i + 200));
    if (!nameMatch) return { ok: false, error: `Line ${line}: “<” is not followed by a tag name.` };
    const tag = nameMatch[0];
    const el: XmlElement = { type: "element", tag, attrs: [], children: [] };
    let k = i + 1 + tag.length;
    let selfClosing = false;
    for (;;) {
      while (k < n && /\s/.test(src[k])) {
        if (src[k] === "\n") line++;
        k++;
      }
      if (k >= n) return { ok: false, error: `Line ${line}: unterminated <${tag}> tag.` };
      if (src[k] === ">") {
        k++;
        break;
      }
      if (src[k] === "/" && src[k + 1] === ">") {
        selfClosing = true;
        k += 2;
        break;
      }
      const attrMatch = NAME_RE.exec(src.slice(k, k + 200));
      if (!attrMatch) return { ok: false, error: `Line ${line}: invalid attribute in <${tag}>.` };
      const name = attrMatch[0];
      k += name.length;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] !== "=") {
        el.attrs.push({ name, value: "" });
        continue;
      }
      k++;
      while (k < n && /\s/.test(src[k])) k++;
      const q = src[k];
      if (q === '"' || q === "'") {
        const end = src.indexOf(q, k + 1);
        if (end === -1) return { ok: false, error: `Line ${line}: unterminated value for attribute ${name}.` };
        const value = src.slice(k + 1, end);
        countLines(value);
        el.attrs.push({ name, value });
        k = end + 1;
      } else {
        const m = /^[^\s>]+/.exec(src.slice(k, k + 1000));
        if (!m) return { ok: false, error: `Line ${line}: missing value for attribute ${name}.` };
        el.attrs.push({ name, value: m[0].replace(/\/$/, "") });
        k += m[0].length;
        if (m[0].endsWith("/")) k--;
      }
    }
    push(el);
    if (!selfClosing) stack.push({ el, line });
    i = k;
  }
  if (stack.length) return { ok: false, error: `Line ${stack[stack.length - 1].line}: <${stack[stack.length - 1].el.tag}> is never closed.` };
  return { ok: true, nodes: root };
}

/* -------------------------------- serializer -------------------------------- */

/** Elements whose text content is significant. */
const PRESERVE_TEXT = new Set(["text", "tspan", "textPath", "title", "desc", "style", "script", "pre"]);

function escapeAttr(v: string): string {
  return v.replace(/"/g, "&quot;");
}

function serializeNode(node: XmlNode, out: string[], inPreserve: boolean): void {
  switch (node.type) {
    case "text":
      out.push(node.value);
      return;
    case "cdata":
      out.push(`<![CDATA[${node.value}]]>`);
      return;
    case "comment":
      out.push(`<!--${node.value}-->`);
      return;
    case "pi":
      out.push(`<?${node.value}?>`);
      return;
    case "doctype":
      out.push(`<!${node.value}>`);
      return;
    case "element": {
      const attrs = node.attrs.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`).join("");
      if (!node.children.length) {
        out.push(`<${node.tag}${attrs}/>`);
        return;
      }
      out.push(`<${node.tag}${attrs}>`);
      const preserve = inPreserve || PRESERVE_TEXT.has(node.tag);
      for (const c of node.children) serializeNode(c, out, preserve);
      out.push(`</${node.tag}>`);
    }
  }
}

export function serializeXml(nodes: XmlNode[]): string {
  const out: string[] = [];
  for (const n of nodes) serializeNode(n, out, false);
  return out.join("");
}

/* --------------------------------- optimizer -------------------------------- */

export interface SvgOptimizeOptions {
  removeComments: boolean;
  removeMetadata: boolean;
  keepTitle: boolean;
  removeEditorNamespaces: boolean;
  removeXmlDeclaration: boolean;
  removeDefaults: boolean;
  removeEmptyGroups: boolean;
  collapseWhitespace: boolean;
  roundNumbers: boolean;
  precision: number;
  removeIds: boolean;
  minifyStyles: boolean;
  removeDimensions: boolean;
}

export const DEFAULT_SVG_OPTIONS: SvgOptimizeOptions = {
  removeComments: true,
  removeMetadata: true,
  keepTitle: false,
  removeEditorNamespaces: true,
  removeXmlDeclaration: true,
  removeDefaults: true,
  removeEmptyGroups: true,
  collapseWhitespace: true,
  roundNumbers: true,
  precision: 3,
  removeIds: true,
  minifyStyles: true,
  removeDimensions: false,
};

export type SvgOptimizeResult = { ok: true; svg: string; before: number; after: number; savedPercent: number; steps: string[] } | { ok: false; error: string };

const EDITOR_PREFIXES = new Set(["inkscape", "sodipodi", "sketch", "figma", "serif", "i", "x", "xap", "a", "ai", "adobe", "illustrator", "dc", "cc", "rdf", "graph", "cdr", "sfw", "sketchflow", "ns_extend", "ns_ai", "ns_graphs", "ns_vars", "ns_imrep", "ns_sfw", "ns_custom", "ns_adobe_xpath", "v", "o", "xlink_", "corel", "svgjs"]);

/** Presentation attributes with their initial values; removing them is a no-op only when no ancestor sets the property. */
const INHERITED_DEFAULTS: Record<string, string[]> = {
  "fill-rule": ["nonzero"],
  "clip-rule": ["nonzero"],
  "stroke-linecap": ["butt"],
  "stroke-linejoin": ["miter"],
  "stroke-miterlimit": ["4"],
  "stroke-dasharray": ["none"],
  "stroke-dashoffset": ["0"],
  "stroke-width": ["1"],
  "stroke-opacity": ["1"],
  "fill-opacity": ["1"],
  stroke: ["none"],
  "font-style": ["normal"],
  "font-weight": ["normal", "400"],
  "text-anchor": ["start"],
  visibility: ["visible"],
  "color-interpolation": ["sRGB"],
  "shape-rendering": ["auto"],
  "image-rendering": ["auto"],
  "text-rendering": ["auto"],
  "letter-spacing": ["normal"],
  "word-spacing": ["normal"],
};
/** Non-inherited attributes whose initial value can always be dropped. */
const PLAIN_DEFAULTS: Record<string, string[]> = {
  opacity: ["1"],
  "stop-opacity": ["1"],
  "flood-opacity": ["1"],
  "clip-path": ["none"],
  mask: ["none"],
  filter: ["none"],
  "font-size-adjust": ["none"],
  version: ["1.1", "1.0"],
  baseProfile: ["full"],
  preserveAspectRatio: ["xMidYMid meet", "xMidYMid"],
};
/** Elements where x/y (and rx/ry for rect) default to 0, so a literal 0 is redundant. */
const ZERO_ORIGIN_TAGS = new Set(["rect", "image", "use", "foreignObject"]);
/** Attributes that hold plain numbers or number lists and may be rounded. */
const NUMERIC_ATTRS = new Set(["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "opacity", "fill-opacity", "stroke-opacity", "stroke-width", "stroke-miterlimit", "stroke-dashoffset", "stroke-dasharray", "d", "points", "viewBox", "transform", "gradientTransform", "patternTransform", "offset", "font-size", "dx", "dy", "stdDeviation", "k1", "k2", "k3", "k4", "refX", "refY", "markerWidth", "markerHeight"]);
const NUMBER_RE = /-?(?:\d+\.\d*|\.\d+|\d+)(?:e[-+]?\d+)?/gi;

export function roundNumberString(value: string, precision: number): string {
  return value.replace(NUMBER_RE, (m) => {
    const num = Number(m);
    if (!Number.isFinite(num)) return m;
    const rounded = Number(num.toFixed(precision));
    return Object.is(rounded, -0) ? "0" : String(rounded);
  });
}

function cleanPathData(d: string): string {
  return d
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*([MLHVCSQTAZmlhvcsqtaz])\s*/g, "$1")
    .replace(/\s+-/g, "-")
    .trim();
}

export function minifyStyle(style: string): string {
  return style
    .split(";")
    .map((decl) => {
      const idx = decl.indexOf(":");
      if (idx < 0) return decl.trim();
      return `${decl.slice(0, idx).trim()}:${decl.slice(idx + 1).trim().replace(/\s+/g, " ")}`;
    })
    .filter(Boolean)
    .join(";");
}

function walk(nodes: XmlNode[], fn: (el: XmlElement, parent: XmlElement | null, ancestors: XmlElement[]) => void, parent: XmlElement | null = null, ancestors: XmlElement[] = []): void {
  for (const n of nodes) {
    if (n.type !== "element") continue;
    fn(n, parent, ancestors);
    walk(n.children, fn, n, [...ancestors, n]);
  }
}

function filterTree(nodes: XmlNode[], keep: (node: XmlNode, parent: XmlElement | null) => boolean, parent: XmlElement | null = null): { nodes: XmlNode[]; removed: number } {
  let removed = 0;
  const out: XmlNode[] = [];
  for (const n of nodes) {
    if (!keep(n, parent)) {
      removed++;
      continue;
    }
    if (n.type === "element") {
      const r = filterTree(n.children, keep, n);
      n.children = r.nodes;
      removed += r.removed;
    }
    out.push(n);
  }
  return { nodes: out, removed };
}

function getAttr(el: XmlElement, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

export function findRoot(nodes: XmlNode[]): XmlElement | null {
  for (const n of nodes) if (n.type === "element") return n.tag.toLowerCase() === "svg" ? n : null;
  return null;
}

function collectReferencedIds(nodes: XmlNode[]): Set<string> {
  const ids = new Set<string>();
  const scan = (text: string) => {
    for (const m of text.matchAll(/url\(\s*['"]?#([^'")\s]+)/g)) ids.add(m[1]);
  };
  walk(nodes, (el) => {
    for (const a of el.attrs) {
      if ((a.name === "href" || a.name === "xlink:href") && a.value.startsWith("#")) ids.add(a.value.slice(1));
      else if (a.name === "begin" || a.name === "end") {
        for (const m of a.value.matchAll(/([A-Za-z_][\w-]*)\.(begin|end|click|mouseover|repeat)/g)) ids.add(m[1]);
      } else scan(a.value);
    }
    if (el.tag === "style") {
      for (const c of el.children) if (c.type === "text" || c.type === "cdata") for (const m of c.value.matchAll(/#([A-Za-z_][\w-]*)/g)) ids.add(m[1]);
    }
  });
  return ids;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Remove Inkscape/Sodipodi/Sketch/Figma/Adobe elements and attributes, then any xmlns:prefix declaration nothing uses. */
function stripEditorNamespaces(input: XmlNode[]): { nodes: XmlNode[]; removed: number } {
  const r = filterTree(input, (n) => {
    if (n.type !== "element") return true;
    const colon = n.tag.indexOf(":");
    return !(colon > 0 && EDITOR_PREFIXES.has(n.tag.slice(0, colon)));
  });
  const nodes = r.nodes;
  let removed = r.removed;
  walk(nodes, (el) => {
    const keep = el.attrs.filter((a) => {
      const colon = a.name.indexOf(":");
      if (colon <= 0) return true;
      const prefix = a.name.slice(0, colon);
      // xmlns declarations are pruned below once we know which prefixes are still used.
      if (prefix === "xmlns" || prefix === "xlink" || prefix === "xml") return true;
      return !EDITOR_PREFIXES.has(prefix);
    });
    removed += el.attrs.length - keep.length;
    el.attrs = keep;
  });
  const used = new Set<string>();
  walk(nodes, (el) => {
    const c = el.tag.indexOf(":");
    if (c > 0) used.add(el.tag.slice(0, c));
    for (const a of el.attrs) {
      const ac = a.name.indexOf(":");
      if (ac > 0 && !a.name.startsWith("xmlns:")) used.add(a.name.slice(0, ac));
    }
  });
  walk(nodes, (el) => {
    const keep = el.attrs.filter((a) => !a.name.startsWith("xmlns:") || used.has(a.name.slice(6)));
    removed += el.attrs.length - keep.length;
    el.attrs = keep;
  });
  return { nodes, removed };
}

export function optimizeSvg(svg: string, options: Partial<SvgOptimizeOptions> = {}): SvgOptimizeResult {
  const opts: SvgOptimizeOptions = { ...DEFAULT_SVG_OPTIONS, ...options };
  if (!svg.trim()) return { ok: false, error: "Paste an SVG to optimize." };
  const parsed = parseXml(svg);
  if (!parsed.ok) return parsed;
  let nodes = parsed.nodes;
  const root = findRoot(nodes);
  if (!root) return { ok: false, error: "The root element is not <svg>." };
  const steps: string[] = [];
  const before = byteLength(svg);

  if (opts.removeXmlDeclaration) {
    const r = filterTree(nodes, (n) => n.type !== "pi" && n.type !== "doctype");
    nodes = r.nodes;
    if (r.removed) steps.push(`Removed XML declaration / doctype (${r.removed})`);
  }
  if (opts.removeComments) {
    const r = filterTree(nodes, (n) => n.type !== "comment");
    nodes = r.nodes;
    if (r.removed) steps.push(`Removed ${r.removed} comment${r.removed === 1 ? "" : "s"}`);
  }
  if (opts.removeMetadata) {
    const drop = new Set(opts.keepTitle ? ["metadata", "desc"] : ["metadata", "desc", "title"]);
    const r = filterTree(nodes, (n) => !(n.type === "element" && drop.has(n.tag)));
    nodes = r.nodes;
    if (r.removed) steps.push(`Removed ${r.removed} metadata/title/desc element${r.removed === 1 ? "" : "s"}`);
  }
  if (opts.removeEditorNamespaces) {
    const r = stripEditorNamespaces(nodes);
    nodes = r.nodes;
    if (r.removed) steps.push(`Removed ${r.removed} editor-specific element${r.removed === 1 ? "" : "s"}/attribute${r.removed === 1 ? "" : "s"}`);
  }
  if (opts.removeIds) {
    const referenced = collectReferencedIds(nodes);
    let removed = 0;
    walk(nodes, (el) => {
      const id = getAttr(el, "id");
      if (id !== undefined && !referenced.has(id)) {
        el.attrs = el.attrs.filter((a) => a.name !== "id");
        removed++;
      }
    });
    if (removed) steps.push(`Removed ${removed} unreferenced id${removed === 1 ? "" : "s"}`);
  }
  if (opts.removeDefaults) {
    let removed = 0;
    walk(nodes, (el, _parent, ancestors) => {
      const keep = el.attrs.filter((a) => {
        const v = a.value.trim();
        const plain = PLAIN_DEFAULTS[a.name];
        if (plain && plain.includes(v)) return false;
        if ((a.name === "x" || a.name === "y") && v === "0" && ZERO_ORIGIN_TAGS.has(el.tag)) return false;
        if ((a.name === "rx" || a.name === "ry") && v === "0" && el.tag === "rect") return false;
        const inherited = INHERITED_DEFAULTS[a.name];
        if (inherited && inherited.includes(a.value.trim())) {
          const ancestorSets = ancestors.some((anc) => anc.attrs.some((x) => x.name === a.name || (x.name === "style" && x.value.includes(a.name))));
          if (!ancestorSets) return false;
        }
        return true;
      });
      removed += el.attrs.length - keep.length;
      el.attrs = keep;
    });
    if (removed) steps.push(`Removed ${removed} default-valued attribute${removed === 1 ? "" : "s"}`);
  }
  if (opts.removeEmptyGroups) {
    let total = 0;
    for (let pass = 0; pass < 10; pass++) {
      const r = filterTree(nodes, (n) => !(n.type === "element" && (n.tag === "g" || n.tag === "defs" || n.tag === "metadata") && n.children.every((c) => c.type === "text" && !c.value.trim())));
      nodes = r.nodes;
      total += r.removed;
      if (!r.removed) break;
    }
    if (total) steps.push(`Removed ${total} empty container${total === 1 ? "" : "s"}`);
  }
  if (opts.minifyStyles) {
    let changed = 0;
    walk(nodes, (el) => {
      for (const a of el.attrs) {
        if (a.name === "style") {
          const m = minifyStyle(a.value);
          if (m !== a.value) changed++;
          a.value = m;
        }
      }
      if (el.tag === "style") {
        for (const c of el.children) {
          if (c.type === "text" || c.type === "cdata") {
            const m = c.value.replace(/\s+/g, " ").replace(/\s*([{};:,])\s*/g, "$1").replace(/;}/g, "}").trim();
            if (m !== c.value) changed++;
            c.value = m;
          }
        }
      }
    });
    if (changed) steps.push(`Minified ${changed} style${changed === 1 ? "" : "s"}`);
  }
  if (opts.roundNumbers) {
    let changed = 0;
    const precision = Math.max(0, Math.min(8, Math.floor(opts.precision)));
    walk(nodes, (el) => {
      for (const a of el.attrs) {
        if (!NUMERIC_ATTRS.has(a.name) || /url\(|#/.test(a.value)) continue;
        let v = roundNumberString(a.value, precision);
        if (a.name === "d") v = cleanPathData(v);
        else if (a.name === "points" || a.name === "viewBox" || a.name === "stroke-dasharray") v = v.replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();
        else if (/transform$/i.test(a.name)) v = v.replace(/\s+/g, " ").replace(/\s*([(),])\s*/g, "$1").trim();
        if (v !== a.value) changed++;
        a.value = v;
      }
    });
    if (changed) steps.push(`Rounded numbers in ${changed} attribute${changed === 1 ? "" : "s"} to ${precision} decimals`);
  }
  if (opts.removeDimensions) {
    const w = getAttr(root, "width");
    const h = getAttr(root, "height");
    if (!getAttr(root, "viewBox") && w && h && /^\d+(\.\d+)?(px)?$/.test(w) && /^\d+(\.\d+)?(px)?$/.test(h)) root.attrs.push({ name: "viewBox", value: `0 0 ${parseFloat(w)} ${parseFloat(h)}` });
    if (getAttr(root, "viewBox")) {
      const n0 = root.attrs.length;
      root.attrs = root.attrs.filter((a) => a.name !== "width" && a.name !== "height");
      if (root.attrs.length !== n0) steps.push("Removed width/height from <svg> (viewBox kept)");
    }
  }
  if (opts.collapseWhitespace) {
    let removed = 0;
    const collapse = (list: XmlNode[], preserve: boolean): XmlNode[] => {
      const out: XmlNode[] = [];
      for (const n of list) {
        if (n.type === "text" && !preserve) {
          if (!n.value.trim()) {
            removed++;
            continue;
          }
          n.value = n.value.replace(/\s+/g, " ").trim();
        } else if (n.type === "element") {
          n.children = collapse(n.children, preserve || PRESERVE_TEXT.has(n.tag));
        }
        out.push(n);
      }
      return out;
    };
    nodes = collapse(nodes, false);
    // Whitespace-only text directly around the root (indentation, trailing newline).
    nodes = nodes.filter((n) => !(n.type === "text" && !n.value.trim()));
    if (removed) steps.push("Collapsed whitespace between elements");
  }

  const out = serializeXml(nodes);
  const after = byteLength(out);
  return { ok: true, svg: out, before, after, savedPercent: before ? Math.max(0, Math.round(((before - after) / before) * 1000) / 10) : 0, steps };
}

/* --------------------------------- SVG → JSX -------------------------------- */

export interface SvgToJsxOptions {
  componentName: string;
  typescript: boolean;
  exportDefault: boolean;
  sizeProps: boolean;
  currentColor: boolean;
}

export const DEFAULT_JSX_OPTIONS: SvgToJsxOptions = { componentName: "Icon", typescript: true, exportDefault: true, sizeProps: false, currentColor: false };

const SVG_PRESENTATION_ATTRS = [
  "accent-height", "alignment-baseline", "arabic-form", "baseline-shift", "cap-height", "clip-path", "clip-rule", "color-interpolation", "color-interpolation-filters", "color-profile", "color-rendering", "dominant-baseline", "enable-background", "fill-opacity", "fill-rule", "flood-color", "flood-opacity", "font-family", "font-size", "font-size-adjust", "font-stretch", "font-style", "font-variant", "font-weight", "glyph-name", "glyph-orientation-horizontal", "glyph-orientation-vertical", "horiz-adv-x", "horiz-origin-x", "image-rendering", "letter-spacing", "lighting-color", "marker-end", "marker-mid", "marker-start", "overline-position", "overline-thickness", "paint-order", "panose-1", "pointer-events", "rendering-intent", "shape-rendering", "stop-color", "stop-opacity", "strikethrough-position", "strikethrough-thickness", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke-width", "text-anchor", "text-decoration", "text-rendering", "underline-position", "underline-thickness", "unicode-bidi", "unicode-range", "units-per-em", "v-alphabetic", "v-hanging", "v-ideographic", "v-mathematical", "vector-effect", "vert-adv-y", "vert-origin-x", "vert-origin-y", "word-spacing", "writing-mode", "x-height",
];

function camel(name: string): string {
  return name.replace(/[-:]([a-z0-9])/gi, (_, c: string) => c.toUpperCase());
}

/** SVG/HTML attribute → JSX prop name. Generated for every presentation attribute plus the special cases React expects. */
export const ATTR_MAP: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(SVG_PRESENTATION_ATTRS.map((a) => [a, camel(a)])),
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  viewbox: "viewBox",
  "xlink:href": "xlinkHref",
  "xlink:actuate": "xlinkActuate",
  "xlink:arcrole": "xlinkArcrole",
  "xlink:role": "xlinkRole",
  "xlink:show": "xlinkShow",
  "xlink:title": "xlinkTitle",
  "xlink:type": "xlinkType",
  "xml:base": "xmlBase",
  "xml:lang": "xmlLang",
  "xml:space": "xmlSpace",
  "xmlns:xlink": "xmlnsXlink",
});

export function jsxAttrName(name: string): string {
  if (name.startsWith("data-") || name.startsWith("aria-")) return name;
  const mapped = ATTR_MAP[name] ?? ATTR_MAP[name.toLowerCase()];
  if (mapped) return mapped;
  if (name.includes("-") || name.includes(":")) return camel(name);
  return name;
}

function cssPropToJs(prop: string): string {
  const p = prop.trim();
  if (p.startsWith("--")) return JSON.stringify(p);
  const c = camel(p.replace(/^-(webkit|moz|ms|o)-/, (m) => m.slice(1)));
  return /^(webkit|moz|ms|o)[A-Z]/.test(c) ? c.charAt(0).toUpperCase() + c.slice(1) : c;
}

function styleToJsx(style: string): string {
  const entries = style
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const idx = d.indexOf(":");
      if (idx < 0) return null;
      return `${cssPropToJs(d.slice(0, idx))}: ${JSON.stringify(d.slice(idx + 1).trim())}`;
    })
    .filter((x): x is string => x !== null);
  return `{{ ${entries.join(", ")} }}`;
}

function jsxAttrValue(value: string): string {
  return value.includes('"') || value.includes("\n") ? `{${JSON.stringify(value)}}` : `"${value}"`;
}

function jsxText(text: string): string {
  return /[{}<>]/.test(text) ? `{${JSON.stringify(text)}}` : text;
}

const COLOR_VALUE_RE = /^(#[0-9a-f]{3,8}|rgba?\(.+\)|hsla?\(.+\)|[a-z]+)$/i;
const NON_COLORS = new Set(["none", "currentcolor", "inherit", "transparent", "initial", "unset"]);

function isPaintColor(v: string): boolean {
  const t = v.trim();
  return COLOR_VALUE_RE.test(t) && !NON_COLORS.has(t.toLowerCase()) && !t.startsWith("url(");
}

function renderJsx(el: XmlElement, indent: string, out: string[], isRoot: boolean, opts: SvgToJsxOptions, rootExtra: string[]): void {
  const attrs: string[] = [];
  for (const a of el.attrs) {
    if (isRoot && opts.sizeProps && (a.name === "width" || a.name === "height")) continue;
    if (a.name === "style") {
      attrs.push(`style=${styleToJsx(a.value)}`);
      continue;
    }
    attrs.push(`${jsxAttrName(a.name)}=${jsxAttrValue(a.value)}`);
  }
  if (isRoot) attrs.push(...rootExtra, "{...props}");
  const open = `<${el.tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
  const children = el.children.filter((c) => c.type === "element" || ((c.type === "text" || c.type === "cdata") && c.value.trim()));
  if (!children.length) {
    out.push(`${indent}${open} />`);
    return;
  }
  const textOnly = children.every((c) => c.type !== "element");
  if (textOnly) {
    const text = children.map((c) => (c.type === "text" || c.type === "cdata" ? c.value : "")).join("");
    if (el.tag === "style" || el.tag === "script") out.push(`${indent}${open}>{${JSON.stringify(text.trim())}}</${el.tag}>`);
    else out.push(`${indent}${open}>${jsxText(text.replace(/\s+/g, " ").trim())}</${el.tag}>`);
    return;
  }
  out.push(`${indent}${open}>`);
  for (const c of children) {
    if (c.type === "element") renderJsx(c, `${indent}  `, out, false, opts, rootExtra);
    else if (c.type === "text" || c.type === "cdata") out.push(`${indent}  ${jsxText(c.value.replace(/\s+/g, " ").trim())}`);
  }
  out.push(`${indent}</${el.tag}>`);
}

export function svgToJsx(svg: string, options: Partial<SvgToJsxOptions> = {}): { ok: true; code: string; fileName: string } | { ok: false; error: string } {
  const opts: SvgToJsxOptions = { ...DEFAULT_JSX_OPTIONS, ...options };
  if (!svg.trim()) return { ok: false, error: "Paste an SVG to convert." };
  const parsed = parseXml(svg);
  if (!parsed.ok) return parsed;
  const root = findRoot(parsed.nodes);
  if (!root) return { ok: false, error: "The root element is not <svg>." };
  const name = /^[A-Za-z_$][\w$]*$/.test(opts.componentName) ? opts.componentName : "Icon";
  const componentName = name.charAt(0).toUpperCase() + name.slice(1);

  // Strip comments and editor cruft (inkscape:label would become an invalid React prop); keep <title> only if the author wrote one.
  filterTree([root], (n) => n.type !== "comment" && n.type !== "pi" && n.type !== "doctype");
  stripEditorNamespaces([root]);

  if (opts.currentColor) {
    const colors = new Set<string>();
    walk([root], (el) => {
      for (const a of el.attrs) {
        if ((a.name === "fill" || a.name === "stroke") && isPaintColor(a.value)) colors.add(a.value.trim().toLowerCase());
        if (a.name === "style") for (const m of a.value.matchAll(/(?:^|;)\s*(fill|stroke)\s*:\s*([^;]+)/g)) if (isPaintColor(m[2])) colors.add(m[2].trim().toLowerCase());
      }
    });
    if (colors.size === 1) {
      walk([root], (el) => {
        for (const a of el.attrs) {
          if ((a.name === "fill" || a.name === "stroke") && isPaintColor(a.value)) a.value = "currentColor";
          if (a.name === "style") a.value = a.value.replace(/(fill|stroke)(\s*:\s*)([^;]+)/g, (m, p: string, sep: string, v: string) => (isPaintColor(v) ? `${p}${sep}currentColor` : m));
        }
      });
    }
  }

  const width = getAttr(root, "width") ?? "24";
  const height = getAttr(root, "height") ?? "24";
  const rootExtra = opts.sizeProps ? ["width={width}", "height={height}"] : [];
  const body: string[] = [];
  renderJsx(root, "    ", body, true, opts, rootExtra);

  const propsType = opts.typescript ? ": SVGProps<SVGSVGElement>" : "";
  const params = opts.sizeProps ? `{ width = ${JSON.stringify(width)}, height = ${JSON.stringify(height)}, ...props }${propsType}` : `props${propsType}`;
  const lines: string[] = [];
  if (opts.typescript) lines.push('import type { SVGProps } from "react";', "");
  lines.push(`export ${opts.exportDefault ? "default " : ""}function ${componentName}(${params}) {`, "  return (", ...body, "  );", "}", "");
  return { ok: true, code: lines.join("\n"), fileName: `${componentName}.${opts.typescript ? "tsx" : "jsx"}` };
}

export const SVG_SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->
<svg
   width="24px"
   height="24px"
   viewBox="0 0 24.000001 24.000001"
   version="1.1"
   id="svg1"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:xlink="http://www.w3.org/1999/xlink"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:svg="http://www.w3.org/2000/svg">
  <title>Bolt</title>
  <metadata id="metadata1">
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description>generator</rdf:Description></rdf:RDF>
  </metadata>
  <sodipodi:namedview id="namedview1" pagecolor="#ffffff" inkscape:zoom="12.5" inkscape:cx="12" />
  <defs id="defs1">
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c8cff" stop-opacity="1" />
      <stop offset="1.00000" stop-color="#3ecf8e" />
    </linearGradient>
  </defs>
  <g id="layer1" inkscape:label="Layer 1" inkscape:groupmode="layer" fill-rule="nonzero" opacity="1">
    <g id="emptyGroup"></g>
    <!-- the bolt -->
    <path
       id="path1"
       class="bolt"
       style="fill:url(#grad); stroke:#111318;  stroke-width:1.5000001; stroke-linejoin:round"
       d="M 13.000001,2.0000004 3,14.000001 h 7.4999998 l -1.4999996,7.9999996 10.0000008,-12.0000006 h -7.5000004 z" />
    <circle cx="12.000000001" cy="12" r="0.0000001" fill="#111318" fill-opacity="1.0" stroke="none" />
  </g>
</svg>
`;
