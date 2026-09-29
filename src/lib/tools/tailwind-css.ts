import { parseColor, rgbToHex } from "@/lib/tools/color";
import { BREAKPOINTS, COLOR_BY_HEX, COLOR_PROPERTIES, COLORS, FRACTIONS, PROPERTY_PREFIX, SCALES, SPACING, SPACING_PROPERTIES, STATIC, VARIANTS, type Declaration, type Decls, type ScaleRule } from "@/lib/tools/tailwind-data";

export const TAILWIND_LIMITS = { maxClasses: 500, maxDeclarations: 300, maxInputChars: 20_000 } as const;

export interface CssBlock {
  selector: string;
  media?: string;
  declarations: Declaration[];
  /** The classes that produced this block. */
  from: string[];
}

export interface TailwindToCssResult {
  ok: true;
  blocks: CssBlock[];
  css: string;
  unknown: string[];
  notes: string[];
}

export interface TailwindToCssOptions {
  /** Root font size used when `unit` is "px". */
  rem?: number;
  unit?: "rem" | "px";
  /** Selector the utilities are grouped under. */
  selector?: string;
}

interface Resolved {
  decls: Decls;
  selectorSuffix?: string;
  note?: string;
}

/** Own-property lookup so user text like `p-constructor` never reads Object.prototype. */
const own = <T,>(obj: Record<string, T> | undefined, k: string): T | undefined => (obj && Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : undefined);

const LENGTH_RE = /^-?(\d*\.\d+|\d+)(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|svh|dvh|lvh|svw|dvw|lvw|cqw|cqh)$|^0$|^(calc|var|clamp|min|max)\(/;

function splitVariants(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of token) {
    if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    if (ch === ":" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function arbitraryValue(raw: string, type: ScaleRule["arbitrary"]): string | null {
  if (!type || type === "none") return null;
  const value = raw.replace(/_/g, " ").trim();
  if (!value || value.length > 200) return null;
  if (type === "length") return LENGTH_RE.test(value) ? value : null;
  if (type === "color") return parseColor(value) ? value : null;
  return value;
}

function negate(value: string): string | null {
  if (/^0(px|rem|%)?$/.test(value)) return value;
  if (/^-?\d/.test(value)) return value.startsWith("-") ? value.slice(1) : `-${value}`;
  return null;
}

function colorValue(name: string, opacity: string | undefined): string | null {
  let base: string | undefined = own(COLORS, name);
  if (!base && name.startsWith("[") && name.endsWith("]")) base = arbitraryValue(name.slice(1, -1), "color") ?? undefined;
  if (!base) return null;
  if (opacity === undefined) return base;
  const a = Number(opacity);
  const rgb = parseColor(base);
  if (!rgb || !Number.isFinite(a) || a < 0 || a > 100) return null;
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${a / 100})`;
}

function resolveScale(rule: ScaleRule, rest: string, negative: boolean): Resolved | null {
  let value: string | string[] | undefined;
  // An arbitrary value only sets the first property: `text-[15px]` is font-size alone, unlike `text-sm`.
  let arbitrary = false;
  if (rule.kind === "color") {
    if (negative) return null;
    const slash = rest.lastIndexOf("/");
    const name = slash > 0 && !rest.endsWith("]") ? rest.slice(0, slash) : rest;
    const opacity = slash > 0 && !rest.endsWith("]") ? rest.slice(slash + 1) : undefined;
    value = colorValue(name, opacity) ?? undefined;
  } else if (rest.startsWith("[") && rest.endsWith("]")) {
    value = arbitraryValue(rest.slice(1, -1), rule.arbitrary) ?? undefined;
    arbitrary = true;
  } else if (rule.kind === "spacing") {
    value = own(SPACING, rest) ?? own(rule.extra, rest) ?? (rule.fractions ? own(FRACTIONS, rest) : undefined);
  } else {
    value = own(rule.table, rest) ?? own(rule.extra, rest);
  }
  if (value === undefined) return null;
  if (negative) {
    if (!rule.negative || Array.isArray(value)) return null;
    const n = negate(value);
    if (n === null) return null;
    value = n;
  }
  const props = arbitrary ? rule.props.slice(0, 1) : rule.props;
  const decls: Decls = props.map((p, i) => {
    const v = Array.isArray(value) ? (value[i] ?? "") : value;
    return [p, rule.format ? rule.format(v) : v];
  });
  return { decls, selectorSuffix: rule.selector, note: rule.note };
}

function resolveUtility(util: string): Resolved | null {
  const stat = own(STATIC, util);
  if (stat) return { decls: stat };
  const arb = /^\[([a-z-]+):([^\]]+)\]$/.exec(util);
  if (arb) return { decls: [[arb[1], arb[2].replace(/_/g, " ")]] };
  const negative = util.startsWith("-");
  const name = negative ? util.slice(1) : util;
  for (const rule of SCALES) {
    let rest: string | null = null;
    if (name === rule.prefix) rest = "";
    else if (name.startsWith(`${rule.prefix}-`)) rest = name.slice(rule.prefix.length + 1);
    if (rest === null) continue;
    const r = resolveScale(rule, rest, negative);
    if (r) return r;
  }
  return null;
}

function remToPx(value: string, rem: number): string {
  return value.replace(/(-?\d*\.?\d+)rem\b/g, (_, n: string) => `${Math.round(Number(n) * rem * 1000) / 1000}px`);
}

const COMPOSABLE = new Set(["box-shadow", "transform", "filter", "backdrop-filter"]);

function renderBlocks(blocks: CssBlock[]): string {
  const out: string[] = [];
  const rule = (b: CssBlock, indent: string) => `${indent}${b.selector} {\n${b.declarations.map((d) => `${indent}  ${d.property}: ${d.value};`).join("\n")}\n${indent}}`;
  const plain = blocks.filter((b) => !b.media);
  for (const b of plain) out.push(rule(b, ""));
  const medias = [...new Set(blocks.filter((b) => b.media).map((b) => b.media as string))];
  for (const m of medias) {
    const inner = blocks.filter((b) => b.media === m).map((b) => rule(b, "  "));
    out.push(`@media ${m} {\n${inner.join("\n\n")}\n}`);
  }
  return out.join("\n\n");
}

/** Translate a class list into grouped CSS blocks. Unknown classes are reported, never thrown. */
export function tailwindToCss(classes: string, options: TailwindToCssOptions = {}): TailwindToCssResult {
  const base = options.selector?.trim() || ".element";
  const unit = options.unit ?? "rem";
  const rem = options.rem && options.rem > 0 ? options.rem : 16;
  const tokens = [...new Set(classes.slice(0, TAILWIND_LIMITS.maxInputChars).split(/\s+/).filter(Boolean))].slice(0, TAILWIND_LIMITS.maxClasses);

  const blocks = new Map<string, CssBlock>();
  const unknown: string[] = [];
  const notes = new Set<string>();

  const add = (selector: string, media: string | undefined, decls: Decls, from: string, important: boolean) => {
    const key = `${media ?? ""}\u0000${selector}`;
    let block = blocks.get(key);
    if (!block) {
      block = { selector, media, declarations: [], from: [] };
      blocks.set(key, block);
    }
    for (const [property, raw] of decls) {
      const value = `${unit === "px" ? remToPx(raw, rem) : raw}${important ? " !important" : ""}`;
      // Later utilities override earlier ones, except for properties Tailwind composes
      // through variables (shadow + ring, several transforms): keep both so the conflict is visible.
      const existing = COMPOSABLE.has(property) ? -1 : block.declarations.findIndex((d) => d.property === property);
      if (existing >= 0) block.declarations[existing] = { property, value };
      else block.declarations.push({ property, value });
    }
    if (!block.from.includes(from)) block.from.push(from);
  };

  for (const token of tokens) {
    const parts = splitVariants(token);
    let util = parts.pop() ?? "";
    let important = false;
    if (util.startsWith("!")) {
      important = true;
      util = util.slice(1);
    } else if (util.endsWith("!")) {
      important = true;
      util = util.slice(0, -1);
    }

    let pseudo = "";
    const medias: string[] = [];
    const wraps: Array<(s: string) => string> = [];
    let bad = false;
    for (const v of parts) {
      const variant = own(VARIANTS, v);
      if (!variant) {
        bad = true;
        break;
      }
      if (variant.pseudo) pseudo += variant.pseudo;
      if (variant.media) medias.push(variant.media);
      if (variant.wrap) wraps.push(variant.wrap);
    }
    if (bad) {
      unknown.push(token);
      continue;
    }
    const media = medias.length ? medias.join(" and ") : undefined;
    let selector = `${base}${pseudo}`;
    for (const w of wraps) selector = w(selector);

    if (util === "container") {
      add(selector, media, [["width", "100%"]], token, important);
      for (const [, px] of Object.entries(BREAKPOINTS)) {
        add(selector, [media, `(min-width: ${px}px)`].filter(Boolean).join(" and "), [["max-width", `${px}px`]], token, important);
      }
      notes.add("container sets width: 100% and a max-width at each breakpoint (no centering or padding unless configured).");
      continue;
    }

    const resolved = resolveUtility(util);
    if (!resolved) {
      unknown.push(token);
      continue;
    }
    add(`${selector}${resolved.selectorSuffix ?? ""}`, media, resolved.decls, token, important);
    if (resolved.note) notes.add(resolved.note);
    if (resolved.decls.some(([p]) => p === "transform")) notes.add("Tailwind composes transforms through CSS variables; the standalone transform shown here overrides any other transform utility on the element.");
    if (resolved.decls.some(([p]) => p.startsWith("--tw-ring") || p === "--tw-shadow-color" || p.startsWith("--tw-gradient"))) {
      notes.add("Utilities that only set --tw-* custom properties need the matching base utility (ring, shadow, bg-gradient-to-*) to have a visible effect.");
    }
  }

  const ordered = [...blocks.values()].sort((a, b) => Number(Boolean(a.media)) - Number(Boolean(b.media)));
  return { ok: true, blocks: ordered, css: renderBlocks(ordered), unknown, notes: [...notes] };
}

// ---------------------------------------------------------------------------
// Reverse direction
// ---------------------------------------------------------------------------

export interface CssToTailwindResult {
  classes: string[];
  unmapped: Declaration[];
  notes: string[];
}

interface ReverseIndex {
  single: Map<string, string>;
  multi: Array<{ className: string; decls: Decls }>;
  partial: Map<string, { className: string; missing: Decls }>;
}

let reverseIndex: ReverseIndex | null = null;

const key = (property: string, value: string) => `${property}|${value.toLowerCase()}`;

function enumerateRule(rule: ScaleRule, emit: (className: string, decls: Decls) => void) {
  if (rule.selector) return;
  let keys: Record<string, string | string[]>;
  if (rule.kind === "spacing") keys = { ...SPACING, ...(rule.fractions ? FRACTIONS : {}), ...(rule.extra ?? {}) };
  else if (rule.kind === "color") keys = COLORS;
  else keys = { ...(rule.table ?? {}), ...(rule.extra ?? {}) };
  for (const k of Object.keys(keys)) {
    const className = k === "" ? rule.prefix : `${rule.prefix}-${k}`;
    const r = resolveScale(rule, k, false);
    if (r) emit(className, r.decls);
    if (rule.negative && /^\d/.test(k)) {
      const n = resolveScale(rule, k, true);
      if (n) emit(`-${className}`, n.decls);
    }
  }
}

function buildIndex(): ReverseIndex {
  const single = new Map<string, string>();
  const multi: ReverseIndex["multi"] = [];
  const partial = new Map<string, { className: string; missing: Decls }>();
  const emit = (className: string, decls: Decls) => {
    if (decls.length === 1) {
      const k = key(decls[0][0], decls[0][1]);
      if (!single.has(k)) single.set(k, className);
    } else {
      multi.push({ className, decls });
      for (const d of decls) {
        const k = key(d[0], d[1]);
        if (!partial.has(k)) partial.set(k, { className, missing: decls.filter((x) => x !== d) });
      }
    }
  };
  for (const [className, decls] of Object.entries(STATIC)) emit(className, decls);
  for (const rule of SCALES) enumerateRule(rule, emit);
  single.set(key("flex", "1"), "flex-1");
  for (const kw of ["ease-in", "ease-out", "ease-in-out"]) single.set(key("transition-timing-function", kw), kw);
  multi.sort((a, b) => b.decls.length - a.decls.length);
  return { single, multi, partial };
}

const SIDES = ["top", "right", "bottom", "left"] as const;

function expandBox(values: string[]): [string, string, string, string] | null {
  const [a, b = a, c = a, d = b] = values;
  if (values.length < 1 || values.length > 4) return null;
  return [a, b, c, d];
}

/** Expand common shorthands into the longhands the tables know. */
function expandShorthand(property: string, value: string): Decls {
  const parts = value.split(/\s+/);
  if ((property === "padding" || property === "margin" || property === "inset") && parts.length > 1) {
    const box = expandBox(parts);
    if (!box) return [[property, value]];
    const prop = (side: string) => (property === "inset" ? side : `${property}-${side}`);
    return SIDES.map((side, i) => [prop(side), box[i]]);
  }
  if (property === "gap" && parts.length === 2) return [["row-gap", parts[0]], ["column-gap", parts[1]]];
  if (property === "border" || property === "outline") {
    const out: Decls = [];
    for (const p of parts) {
      if (/^(\d*\.?\d+)(px|rem|em)$|^0$/.test(p)) out.push([`${property}-width`, p]);
      else if (/^(none|solid|dashed|dotted|double|hidden)$/.test(p)) out.push([`${property}-style`, p]);
      else out.push([`${property}-color`, p]);
    }
    return out.length ? out : [[property, value]];
  }
  if (property === "transition") {
    const out: Decls = [];
    const props: string[] = [];
    let times = 0;
    for (const p of value.split(/\s*,\s*|\s+/)) {
      if (/^\d*\.?\d+m?s$/.test(p)) out.push([times++ === 0 ? "transition-duration" : "transition-delay", p]);
      else if (/^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$|^(cubic-bezier|steps)\(/.test(p)) out.push(["transition-timing-function", p]);
      else if (p) props.push(p);
    }
    if (props.length) out.unshift(["transition-property", props.join(", ")]);
    return out;
  }
  return [[property, value]];
}

function parseDeclarations(cssText: string): { decls: Array<Declaration & { important: boolean }>; hadSelectors: boolean } {
  const text = cssText.slice(0, TAILWIND_LIMITS.maxInputChars).replace(/\/\*[\s\S]*?\*\//g, "");
  let bodies: string[] = [];
  const hadSelectors = text.includes("{");
  if (hadSelectors) {
    const re = /\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) bodies.push(m[1]);
  } else bodies = [text];
  const decls: Array<Declaration & { important: boolean }> = [];
  for (const body of bodies) {
    for (const raw of body.split(";")) {
      const idx = raw.indexOf(":");
      if (idx <= 0) continue;
      const property = raw.slice(0, idx).trim().toLowerCase();
      let value = raw.slice(idx + 1).replace(/\s+/g, " ").trim();
      if (!/^[-a-z]+$/.test(property) || !value) continue;
      const important = /!important$/i.test(value);
      if (important) value = value.replace(/\s*!important$/i, "").trim();
      decls.push({ property, value, important });
      if (decls.length >= TAILWIND_LIMITS.maxDeclarations) return { decls, hadSelectors };
    }
  }
  return { decls, hadSelectors };
}

const LENGTH_PROPERTY = /width|radius|offset|indent|inset|gap|margin|padding|^(top|right|bottom|left)$/;

/** Lowercase, unify zero lengths, and snap px values that sit exactly on the spacing scale to rem so grouped utilities (py-4) still match. */
function normaliseValue(property: string, value: string, rem: number): string {
  const v = value.toLowerCase();
  if (!LENGTH_PROPERTY.test(property)) return v;
  if (/^0(px|rem|em|%)?$/.test(v)) return "0px";
  const r = toRem(v, rem);
  if (r !== null && v.endsWith("px") && Object.values(SPACING).includes(`${r}rem`)) return `${r}rem`;
  return v;
}

function toRem(value: string, rem: number): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem)$/.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "px" ? n / rem : n;
}

function nearestSpacing(remValue: number): { key: string; value: string; diff: number } | null {
  let best: { key: string; value: string; diff: number } | null = null;
  for (const [k, v] of Object.entries(SPACING)) {
    const n = toRem(v, 16);
    if (n === null) continue;
    const diff = Math.abs(Math.abs(remValue) - n);
    if (!best || diff < best.diff) best = { key: k, value: v, diff };
  }
  return best;
}

function arbitrary(prefix: string, value: string): string {
  return `${prefix}-[${value.replace(/\s+/g, "_")}]`;
}

/** Map CSS declarations (a whole rule or bare declarations) back to utility classes. */
export function cssToTailwind(cssText: string, options: { rem?: number } = {}): CssToTailwindResult {
  const rem = options.rem && options.rem > 0 ? options.rem : 16;
  const index = (reverseIndex ??= buildIndex());
  const { decls: parsed, hadSelectors } = parseDeclarations(cssText);
  const notes = new Set<string>();
  if (hadSelectors) notes.add("Selectors and media queries were ignored. Add variants such as hover: or md: yourself.");

  // Expand shorthands and normalise values first.
  const pending: Array<Declaration & { important: boolean }> = [];
  for (const d of parsed) {
    for (const [property, value] of expandShorthand(d.property, d.value)) {
      pending.push({ property, value: normaliseValue(property, value, rem), important: d.important });
    }
  }

  const found: Array<{ at: number; cls: string }> = [];
  const unmapped: Declaration[] = [];
  const bang = (important: boolean, cls: string) => (important ? `!${cls}` : cls);
  const used = new Set<number>();

  // 1. Multi-declaration utilities (truncate, px-4, text-base…) consume whole groups.
  for (const m of index.multi) {
    const hits: number[] = [];
    for (const [p, v] of m.decls) {
      const i = pending.findIndex((d, idx) => !used.has(idx) && key(d.property, d.value) === key(p, v));
      if (i < 0) break;
      hits.push(i);
    }
    if (hits.length === m.decls.length && new Set(hits).size === hits.length) {
      hits.forEach((i) => used.add(i));
      found.push({ at: Math.min(...hits), cls: bang(pending[hits[0]].important, m.className) });
    }
  }

  // 2. Everything else, one declaration at a time.
  pending.forEach((d, idx) => {
    if (used.has(idx)) return;
    const k = key(d.property, d.value);
    const exact = index.single.get(k);
    if (exact) {
      found.push({ at: idx, cls: bang(d.important, exact) });
      return;
    }
    const prefix = own(PROPERTY_PREFIX, d.property);

    if (COLOR_PROPERTIES.has(d.property)) {
      const c = parseColor(d.value);
      if (c && prefix) {
        const hex = rgbToHex({ ...c, a: 1 });
        const name = own(COLOR_BY_HEX, hex);
        if (name) {
          found.push({ at: idx, cls: bang(d.important, c.a < 1 ? `${prefix}-${name}/${Math.round(c.a * 100)}` : `${prefix}-${name}`) });
        } else found.push({ at: idx, cls: bang(d.important, arbitrary(prefix, rgbToHex(c, c.a < 1))) });
        return;
      }
    }

    // px values that equal a rem step (16px -> 1rem -> p-4).
    const asRem = toRem(d.value, rem);
    if (asRem !== null && prefix) {
      const remKey = key(d.property, `${Math.round(asRem * 10000) / 10000}rem`);
      const viaRem = index.single.get(remKey);
      if (viaRem) {
        found.push({ at: idx, cls: bang(d.important, viaRem) });
        return;
      }
      if (SPACING_PROPERTIES.has(d.property)) {
        const near = nearestSpacing(asRem);
        const tolerance = Math.max(0.125, Math.abs(asRem) * 0.2);
        if (near && near.diff > 0 && near.diff <= tolerance) {
          const cls = `${asRem < 0 ? "-" : ""}${prefix}-${near.key}`;
          found.push({ at: idx, cls: bang(d.important, cls) });
          notes.add(`${d.property}: ${d.value} is not on the spacing scale; ${cls} (${asRem < 0 ? "-" : ""}${near.value}) is the nearest step.`);
          return;
        }
      }
    }

    const part = index.partial.get(k);
    if (part) {
      found.push({ at: idx, cls: bang(d.important, part.className) });
      notes.add(`${part.className} also sets ${part.missing.map(([p, v]) => `${p}: ${v}`).join("; ")}.`);
      return;
    }

    if (prefix) {
      found.push({ at: idx, cls: bang(d.important, arbitrary(prefix, d.value)) });
      return;
    }
    unmapped.push({ property: d.property, value: d.value });
  });

  const classes = [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.cls))];
  return { classes, unmapped, notes: [...notes] };
}

export const TAILWIND_CSS_SAMPLE = "flex items-center justify-between gap-4 p-4 md:p-6 rounded-xl bg-white/80 text-slate-900 shadow-md hover:shadow-lg dark:bg-slate-900";

export const CSS_TO_TAILWIND_SAMPLE = `.card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 16px 24px;
  border-radius: 0.75rem;
  background-color: #ffffff;
  color: #0f172a;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  margin-top: 15px;
  width: 37px;
  border: 1px solid #e2e8f0;
}`;
