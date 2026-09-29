import type { CSSProperties } from "react";

export type FlexDirection = "row" | "row-reverse" | "column" | "column-reverse";
export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
export type JustifyContent = "normal" | "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly" | "stretch";
export type AlignItems = "stretch" | "flex-start" | "flex-end" | "center" | "baseline";
export type AlignContent = "normal" | "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly" | "stretch";
export type AlignSelf = "auto" | AlignItems;
export type JustifyItems = "stretch" | "start" | "end" | "center";
export type AutoFlow = "row" | "column" | "row dense" | "column dense";

export interface FlexItemOverride {
  /** 1-based item number. */
  index: number;
  grow?: number;
  shrink?: number;
  basis?: string;
  alignSelf?: AlignSelf;
  order?: number;
}

export interface FlexOptions {
  direction: FlexDirection;
  wrap: FlexWrap;
  justifyContent: JustifyContent;
  alignItems: AlignItems;
  alignContent: AlignContent;
  /** px */
  gap: number;
  itemCount: number;
  items: FlexItemOverride[];
}

export interface GridItemOverride {
  index: number;
  colSpan?: number;
  rowSpan?: number;
}

export interface GridOptions {
  columnsMode: "repeat" | "custom";
  columns: number;
  columnsTemplate: string;
  /** 0 = auto rows */
  rows: number;
  rowsTemplate: string;
  rowGap: number;
  columnGap: number;
  justifyItems: JustifyItems;
  alignItems: AlignItems;
  justifyContent: JustifyContent;
  alignContent: AlignContent;
  autoFlow: AutoFlow;
  itemCount: number;
  items: GridItemOverride[];
}

export interface LayoutOutput {
  css: string;
  containerStyle: CSSProperties;
  itemStyles: Record<number, CSSProperties>;
  tailwind: string;
  itemTailwind: Record<number, string>;
}

export const LAYOUT_LIMITS = { maxItems: 12, maxGap: 200, maxColumns: 12, maxSpan: 12 } as const;

export const JUSTIFY_OPTIONS: JustifyContent[] = ["normal", "flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly", "stretch"];
export const ALIGN_ITEMS_OPTIONS: AlignItems[] = ["stretch", "flex-start", "flex-end", "center", "baseline"];
export const ALIGN_CONTENT_OPTIONS: AlignContent[] = ["normal", "flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly", "stretch"];
export const ALIGN_SELF_OPTIONS: AlignSelf[] = ["auto", "stretch", "flex-start", "flex-end", "center", "baseline"];
export const JUSTIFY_ITEMS_OPTIONS: JustifyItems[] = ["stretch", "start", "end", "center"];
export const AUTO_FLOW_OPTIONS: AutoFlow[] = ["row", "column", "row dense", "column dense"];

const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));

const SPACING_STEPS = new Set([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96]);

/** `gap-4` when the px value sits on Tailwind's 4px scale, otherwise an arbitrary value. */
export function pxToTailwind(prefix: string, px: number): string {
  if (px === 1) return `${prefix}-px`;
  const step = px / 4;
  return SPACING_STEPS.has(step) ? `${prefix}-${step}` : `${prefix}-[${px}px]`;
}

const suffix = (v: string) => v.replace("flex-", "").replace("space-", "");

const TW = {
  direction: { row: "flex-row", "row-reverse": "flex-row-reverse", column: "flex-col", "column-reverse": "flex-col-reverse" } as Record<FlexDirection, string>,
  wrap: { nowrap: "flex-nowrap", wrap: "flex-wrap", "wrap-reverse": "flex-wrap-reverse" } as Record<FlexWrap, string>,
  autoFlow: { row: "grid-flow-row", column: "grid-flow-col", "row dense": "grid-flow-row-dense", "column dense": "grid-flow-col-dense" } as Record<AutoFlow, string>,
};

function itemsInRange(count: number) {
  return (o: { index: number }) => Number.isInteger(o.index) && o.index >= 1 && o.index <= count;
}

function rule(selector: string, decls: Array<[string, string | number | undefined]>): string {
  const body = decls.filter((d): d is [string, string | number] => d[1] !== undefined && d[1] !== "").map(([p, v]) => `  ${p}: ${v};`);
  return body.length ? `${selector} {\n${body.join("\n")}\n}` : "";
}

export const FLEX_DEFAULTS: FlexOptions = { direction: "row", wrap: "nowrap", justifyContent: "flex-start", alignItems: "stretch", alignContent: "normal", gap: 12, itemCount: 4, items: [] };

export function flexCss(raw: FlexOptions): LayoutOutput {
  const gap = clampInt(raw.gap, 0, LAYOUT_LIMITS.maxGap);
  const count = clampInt(raw.itemCount, 1, LAYOUT_LIMITS.maxItems);
  const items = raw.items.filter(itemsInRange(count));

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: raw.direction,
    flexWrap: raw.wrap,
    justifyContent: raw.justifyContent,
    alignItems: raw.alignItems,
    alignContent: raw.alignContent === "normal" ? undefined : raw.alignContent,
    gap: `${gap}px`,
  };
  const container = rule(".container", [
    ["display", "flex"],
    ["flex-direction", raw.direction],
    ["flex-wrap", raw.wrap],
    ["justify-content", raw.justifyContent],
    ["align-items", raw.alignItems],
    ["align-content", raw.alignContent === "normal" ? undefined : raw.alignContent],
    ["gap", `${gap}px`],
  ]);

  const itemStyles: Record<number, CSSProperties> = {};
  const itemTailwind: Record<number, string> = {};
  const itemRules: string[] = [];
  for (const it of items) {
    const grow = it.grow !== undefined && Number.isFinite(it.grow) ? Math.max(0, it.grow) : undefined;
    const shrink = it.shrink !== undefined && Number.isFinite(it.shrink) ? Math.max(0, it.shrink) : undefined;
    const basis = it.basis?.trim().slice(0, 40) || undefined;
    const alignSelf = it.alignSelf && it.alignSelf !== "auto" ? it.alignSelf : undefined;
    const order = it.order !== undefined && Number.isFinite(it.order) && it.order !== 0 ? Math.round(it.order) : undefined;
    itemStyles[it.index] = { flexGrow: grow, flexShrink: shrink, flexBasis: basis, alignSelf, order };
    const r = rule(`.item:nth-child(${it.index})`, [
      ["flex-grow", grow],
      ["flex-shrink", shrink],
      ["flex-basis", basis],
      ["align-self", alignSelf],
      ["order", order],
    ]);
    if (r) itemRules.push(r);
    const tw: string[] = [];
    if (grow !== undefined) tw.push(grow === 1 ? "grow" : grow === 0 ? "grow-0" : `grow-[${grow}]`);
    if (shrink !== undefined) tw.push(shrink === 1 ? "shrink" : shrink === 0 ? "shrink-0" : `shrink-[${shrink}]`);
    if (basis) tw.push(basis === "auto" ? "basis-auto" : basis === "100%" ? "basis-full" : `basis-[${basis.replace(/\s+/g, "_")}]`);
    if (alignSelf) tw.push(`self-${suffix(alignSelf)}`);
    if (order !== undefined) tw.push(order >= 1 && order <= 12 ? `order-${order}` : `order-[${order}]`);
    itemTailwind[it.index] = tw.join(" ");
  }

  const tailwind = ["flex", TW.direction[raw.direction], TW.wrap[raw.wrap], `justify-${suffix(raw.justifyContent)}`, `items-${suffix(raw.alignItems)}`, raw.alignContent === "normal" ? "" : `content-${suffix(raw.alignContent)}`, pxToTailwind("gap", gap)]
    .filter(Boolean)
    .join(" ");

  return { css: [container, ...itemRules].join("\n\n"), containerStyle, itemStyles, tailwind, itemTailwind };
}

export const GRID_DEFAULTS: GridOptions = {
  columnsMode: "repeat",
  columns: 3,
  columnsTemplate: "repeat(3, minmax(0, 1fr))",
  rows: 0,
  rowsTemplate: "",
  rowGap: 12,
  columnGap: 12,
  justifyItems: "stretch",
  alignItems: "stretch",
  justifyContent: "normal",
  alignContent: "normal",
  autoFlow: "row",
  itemCount: 6,
  items: [],
};

export function gridCss(raw: GridOptions): LayoutOutput {
  const rowGap = clampInt(raw.rowGap, 0, LAYOUT_LIMITS.maxGap);
  const columnGap = clampInt(raw.columnGap, 0, LAYOUT_LIMITS.maxGap);
  const count = clampInt(raw.itemCount, 1, LAYOUT_LIMITS.maxItems);
  const columns = clampInt(raw.columns, 1, LAYOUT_LIMITS.maxColumns);
  const rows = clampInt(raw.rows, 0, LAYOUT_LIMITS.maxColumns);
  const customCols = raw.columnsTemplate.trim().slice(0, 120);
  const customRows = raw.rowsTemplate.trim().slice(0, 120);
  const colTemplate = raw.columnsMode === "custom" && customCols ? customCols : `repeat(${columns}, minmax(0, 1fr))`;
  const rowTemplate = customRows ? customRows : rows > 0 ? `repeat(${rows}, minmax(0, 1fr))` : undefined;
  const items = raw.items.filter(itemsInRange(count));

  const containerStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: colTemplate,
    gridTemplateRows: rowTemplate,
    rowGap: `${rowGap}px`,
    columnGap: `${columnGap}px`,
    justifyItems: raw.justifyItems,
    alignItems: raw.alignItems,
    justifyContent: raw.justifyContent === "normal" ? undefined : raw.justifyContent,
    alignContent: raw.alignContent === "normal" ? undefined : raw.alignContent,
    gridAutoFlow: raw.autoFlow,
  };
  const container = rule(".container", [
    ["display", "grid"],
    ["grid-template-columns", colTemplate],
    ["grid-template-rows", rowTemplate],
    ["gap", rowGap === columnGap ? `${rowGap}px` : `${rowGap}px ${columnGap}px`],
    ["justify-items", raw.justifyItems],
    ["align-items", raw.alignItems],
    ["justify-content", raw.justifyContent === "normal" ? undefined : raw.justifyContent],
    ["align-content", raw.alignContent === "normal" ? undefined : raw.alignContent],
    ["grid-auto-flow", raw.autoFlow === "row" ? undefined : raw.autoFlow],
  ]);

  const itemStyles: Record<number, CSSProperties> = {};
  const itemTailwind: Record<number, string> = {};
  const itemRules: string[] = [];
  for (const it of items) {
    const colSpan = it.colSpan !== undefined ? clampInt(it.colSpan, 1, LAYOUT_LIMITS.maxSpan) : undefined;
    const rowSpan = it.rowSpan !== undefined ? clampInt(it.rowSpan, 1, LAYOUT_LIMITS.maxSpan) : undefined;
    const col = colSpan && colSpan > 1 ? `span ${colSpan} / span ${colSpan}` : undefined;
    const row = rowSpan && rowSpan > 1 ? `span ${rowSpan} / span ${rowSpan}` : undefined;
    itemStyles[it.index] = { gridColumn: col, gridRow: row };
    const r = rule(`.item:nth-child(${it.index})`, [
      ["grid-column", col],
      ["grid-row", row],
    ]);
    if (r) itemRules.push(r);
    itemTailwind[it.index] = [col ? `col-span-${colSpan}` : "", row ? `row-span-${rowSpan}` : ""].filter(Boolean).join(" ");
  }

  const gapTw = rowGap === columnGap ? pxToTailwind("gap", rowGap) : `${pxToTailwind("gap-x", columnGap)} ${pxToTailwind("gap-y", rowGap)}`;
  const tailwind = [
    "grid",
    raw.columnsMode === "custom" && customCols ? `grid-cols-[${customCols.replace(/\s+/g, "_")}]` : `grid-cols-${columns}`,
    customRows ? `grid-rows-[${customRows.replace(/\s+/g, "_")}]` : rows > 0 ? `grid-rows-${rows}` : "",
    gapTw,
    raw.justifyItems === "stretch" ? "" : `justify-items-${raw.justifyItems}`,
    raw.alignItems === "stretch" ? "" : `items-${suffix(raw.alignItems)}`,
    raw.justifyContent === "normal" ? "" : `justify-${suffix(raw.justifyContent)}`,
    raw.alignContent === "normal" ? "" : `content-${suffix(raw.alignContent)}`,
    raw.autoFlow === "row" ? "" : TW.autoFlow[raw.autoFlow],
  ]
    .filter(Boolean)
    .join(" ");

  return { css: [container, ...itemRules].join("\n\n"), containerStyle, itemStyles, tailwind, itemTailwind };
}

export interface LayoutPreset {
  name: string;
  mode: "flex" | "grid";
  flex?: FlexOptions;
  grid?: GridOptions;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { name: "Navbar", mode: "flex", flex: { ...FLEX_DEFAULTS, justifyContent: "space-between", alignItems: "center", gap: 16, itemCount: 3 } },
  { name: "Centered", mode: "flex", flex: { ...FLEX_DEFAULTS, justifyContent: "center", alignItems: "center", itemCount: 1 } },
  { name: "Wrapping tags", mode: "flex", flex: { ...FLEX_DEFAULTS, wrap: "wrap", gap: 8, itemCount: 10 } },
  { name: "Card grid", mode: "grid", grid: { ...GRID_DEFAULTS, columns: 3, rowGap: 16, columnGap: 16, itemCount: 6 } },
  { name: "Sidebar layout", mode: "grid", grid: { ...GRID_DEFAULTS, columnsMode: "custom", columnsTemplate: "240px 1fr", rowGap: 16, columnGap: 16, itemCount: 2 } },
  {
    name: "Holy grail",
    mode: "grid",
    grid: {
      ...GRID_DEFAULTS,
      columnsMode: "custom",
      columnsTemplate: "200px 1fr 200px",
      rowsTemplate: "auto 1fr auto",
      rowGap: 12,
      columnGap: 12,
      itemCount: 5,
      items: [
        { index: 1, colSpan: 3 },
        { index: 5, colSpan: 3 },
      ],
    },
  },
];

export const FLEXBOX_GRID_SAMPLE = LAYOUT_PRESETS[0];
