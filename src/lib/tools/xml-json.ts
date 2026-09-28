import type { JsonValue } from "@/lib/tools/json";

export interface XmlResult {
  ok: boolean;
  output: string;
  error?: string;
}

export interface XmlOptions {
  /** Prefix for attribute keys */
  attrPrefix: string;
  /** Key used for text content when an element also has attributes/children */
  textKey: string;
  /** Try to coerce numbers/booleans */
  infer: boolean;
}

export const DEFAULT_XML_OPTIONS: XmlOptions = { attrPrefix: "@", textKey: "#text", infer: false };

function parserError(doc: Document): string | null {
  const err = doc.getElementsByTagName("parsererror")[0];
  if (!err) return null;
  const text = (err.textContent ?? "").replace(/\s+/g, " ").trim();
  // Firefox / WebKit / Chromium messages differ; keep the informative tail
  const m = /(?:error on line|line)\s*(\d+)(?:.*?column\s*(\d+))?[:\s]*(.*)/i.exec(text);
  if (m) return `Line ${m[1]}${m[2] ? `, column ${m[2]}` : ""}: ${m[3] || text}`;
  return text.replace(/^This page contains the following errors:\s*/i, "").replace(/Below is a rendering.*$/i, "").trim() || "Invalid XML.";
}

export function parseXml(src: string): { ok: true; doc: Document } | { ok: false; error: string } {
  if (!src.trim()) return { ok: false, error: "Input is empty." };
  if (typeof DOMParser === "undefined") return { ok: false, error: "XML parsing needs a browser environment." };
  const doc = new DOMParser().parseFromString(src, "application/xml");
  const err = parserError(doc);
  if (err) return { ok: false, error: err };
  return { ok: true, doc };
}

function coerce(s: string, infer: boolean): JsonValue {
  if (!infer) return s;
  const t = s.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(t) && t.length < 16) return Number(t);
  return s;
}

function elementToJson(el: Element, opts: XmlOptions): JsonValue {
  const out: Record<string, JsonValue> = {};
  for (const attr of Array.from(el.attributes)) out[`${opts.attrPrefix}${attr.name}`] = coerce(attr.value, opts.infer);
  const children = Array.from(el.childNodes);
  const elements = children.filter((n): n is Element => n.nodeType === 1);
  const text = children
    .filter((n) => n.nodeType === 3 || n.nodeType === 4)
    .map((n) => n.textContent ?? "")
    .join("");
  const hasText = text.trim().length > 0;

  if (!elements.length && !Object.keys(out).length) return hasText ? coerce(text, opts.infer) : "";

  for (const child of elements) {
    const key = child.tagName;
    const val = elementToJson(child, opts);
    if (key in out) {
      const existing = out[key];
      if (Array.isArray(existing)) existing.push(val);
      else out[key] = [existing, val];
    } else out[key] = val;
  }
  if (hasText) out[opts.textKey] = coerce(text.trim(), opts.infer);
  return out;
}

function xmlToJsonUnsafe(src: string, opts: XmlOptions = DEFAULT_XML_OPTIONS, indent = 2): XmlResult {
  const p = parseXml(src);
  if (!p.ok) return { ok: false, output: "", error: p.error };
  const root = p.doc.documentElement;
  const value = { [root.tagName]: elementToJson(root, opts) };
  return { ok: true, output: JSON.stringify(value, null, indent) };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeTag(k: string): string {
  const t = k.replace(/[^A-Za-z0-9_.:-]/g, "_");
  return /^[A-Za-z_]/.test(t) ? t : `_${t}`;
}

function valueToXml(key: string, value: JsonValue, opts: XmlOptions, depth: number, lines: string[]) {
  const pad = "  ".repeat(depth);
  const tag = safeTag(key);
  if (Array.isArray(value)) {
    for (const item of value) valueToXml(key, item, opts, depth, lines);
    return;
  }
  if (value === null || typeof value !== "object") {
    lines.push(`${pad}<${tag}>${escapeXml(value === null ? "" : String(value))}</${tag}>`);
    return;
  }
  const attrs: string[] = [];
  const children: Array<[string, JsonValue]> = [];
  let text: JsonValue | undefined;
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith(opts.attrPrefix) && k.length > opts.attrPrefix.length && (v === null || typeof v !== "object")) attrs.push(` ${safeTag(k.slice(opts.attrPrefix.length))}="${escapeXml(v === null ? "" : String(v))}"`);
    else if (k === opts.textKey) text = v;
    else children.push([k, v]);
  }
  const open = `${pad}<${tag}${attrs.join("")}`;
  if (!children.length && text === undefined) {
    lines.push(`${open}/>`);
    return;
  }
  if (!children.length) {
    lines.push(`${open}>${escapeXml(text === null ? "" : String(text))}</${tag}>`);
    return;
  }
  lines.push(`${open}>`);
  if (text !== undefined) lines.push(`${pad}  ${escapeXml(text === null ? "" : String(text))}`);
  for (const [k, v] of children) valueToXml(k, v, opts, depth + 1, lines);
  lines.push(`${pad}</${tag}>`);
}

function jsonToXmlUnsafe(src: string, rootName = "root", opts: XmlOptions = DEFAULT_XML_OPTIONS, declaration = true): XmlResult {
  if (!src.trim()) return { ok: false, output: "", error: "Input is empty." };
  let value: JsonValue;
  try {
    value = JSON.parse(src) as JsonValue;
  } catch (e) {
    return { ok: false, output: "", error: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}` };
  }
  const lines: string[] = [];
  if (declaration) lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  // A single-key object whose value is an object becomes the root element itself
  if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && !rootName.trim()) {
    const [k, v] = Object.entries(value)[0];
    valueToXml(k, v, opts, 0, lines);
  } else {
    valueToXml(rootName.trim() || "root", value, opts, 0, lines);
  }
  return { ok: true, output: lines.join("\n") };
}

/** Re-indent XML using the DOM so comments, CDATA and attributes survive. */
export function formatXml(src: string, indent = 2): XmlResult {
  const p = parseXml(src);
  if (!p.ok) return { ok: false, output: "", error: p.error };
  const pad = (d: number) => " ".repeat(indent * d);
  const lines: string[] = [];
  const decl = /^\s*<\?xml[^>]*\?>/.exec(src);
  if (decl) lines.push(decl[0].trim());
  const walk = (node: Node, depth: number) => {
    if (node.nodeType === 1) {
      const el = node as Element;
      const attrs = Array.from(el.attributes)
        .map((a) => ` ${a.name}="${escapeXml(a.value)}"`)
        .join("");
      const kids = Array.from(el.childNodes).filter((n) => !(n.nodeType === 3 && !(n.textContent ?? "").trim()));
      if (!kids.length) {
        lines.push(`${pad(depth)}<${el.tagName}${attrs}/>`);
        return;
      }
      if (kids.length === 1 && (kids[0].nodeType === 3 || kids[0].nodeType === 4)) {
        const t = kids[0].nodeType === 4 ? `<![CDATA[${kids[0].textContent}]]>` : escapeXml((kids[0].textContent ?? "").trim());
        lines.push(`${pad(depth)}<${el.tagName}${attrs}>${t}</${el.tagName}>`);
        return;
      }
      lines.push(`${pad(depth)}<${el.tagName}${attrs}>`);
      for (const k of kids) walk(k, depth + 1);
      lines.push(`${pad(depth)}</${el.tagName}>`);
    } else if (node.nodeType === 3) {
      const t = (node.textContent ?? "").trim();
      if (t) lines.push(`${pad(depth)}${escapeXml(t)}`);
    } else if (node.nodeType === 4) {
      lines.push(`${pad(depth)}<![CDATA[${node.textContent}]]>`);
    } else if (node.nodeType === 8) {
      lines.push(`${pad(depth)}<!--${node.textContent}-->`);
    } else if (node.nodeType === 7) {
      const pi = node as ProcessingInstruction;
      lines.push(`${pad(depth)}<?${pi.target} ${pi.data}?>`);
    }
  };
  for (const child of Array.from(p.doc.childNodes)) walk(child, 0);
  return { ok: true, output: lines.join("\n") };
}

export function minifyXml(src: string): XmlResult {
  const f = formatXml(src, 0);
  if (!f.ok) return f;
  return { ok: true, output: f.output.split("\n").map((l) => l.trim()).join("") };
}

export const XML_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<catalog updated="2026-01-15">
  <book id="bk101" lang="en">
    <title>XML Developer's Guide</title>
    <price currency="USD">44.95</price>
    <tags><tag>xml</tag><tag>reference</tag></tags>
  </book>
  <book id="bk102">
    <title>Midnight Rain</title>
    <price currency="USD">5.95</price>
    <!-- no tags -->
  </book>
</catalog>`;

export const JSON_SAMPLE_FOR_XML = `{
  "catalog": {
    "@updated": "2026-01-15",
    "book": [
      { "@id": "bk101", "title": "XML Developer's Guide", "price": { "@currency": "USD", "#text": 44.95 } },
      { "@id": "bk102", "title": "Midnight Rain", "price": 5.95 }
    ]
  }
}`;

function guard(fn: () => XmlResult): XmlResult {
  try {
    return fn();
  } catch (e) {
    return { ok: false, output: "", error: e instanceof RangeError ? "The document is nested too deeply to convert in the browser." : e instanceof Error ? e.message : "Conversion failed." };
  }
}

export function xmlToJson(src: string, opts: XmlOptions = DEFAULT_XML_OPTIONS, indent = 2): XmlResult {
  return guard(() => xmlToJsonUnsafe(src, opts, indent));
}

export function jsonToXml(src: string, rootName = "root", opts: XmlOptions = DEFAULT_XML_OPTIONS, declaration = true): XmlResult {
  return guard(() => jsonToXmlUnsafe(src, rootName, opts, declaration));
}
