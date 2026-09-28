import { MAX_TEXT_INPUT } from "@/lib/limits";
import { parseJson, type JsonParseOk, type JsonValue } from "@/lib/tools/json";
import { queryJsonPath, type Match } from "@/lib/tools/jsonpath";
import { jsonToCsv, type Delimiter } from "@/lib/tools/csv-json";

/**
 * DevBox Workflows MVP: JSON text → JSONPath selection → CSV.
 *
 * Pure and synchronous. Everything runs on the caller's thread in the browser;
 * nothing here touches storage, the network or the DOM. The caller keeps input
 * and output in component state only, so no user data is persisted.
 *
 * Steps are composed from the existing tool modules (`parseJson`,
 * `queryJsonPath`, `jsonToCsv`); this file only adds row selection rules,
 * limits and typed errors.
 */

export interface WorkflowLimits {
  /** Characters of JSON text. Matches the shared Textarea cap. */
  maxInputChars: number;
  /** Characters in the JSONPath expression. */
  maxExpressionChars: number;
  /** Rows that may be written to the CSV (after unwrapping a matched array). */
  maxRows: number;
  /** Distinct column names across all object rows. */
  maxColumns: number;
  /**
   * Cells (rows × columns) the CSV may contain. Sparse rows with disjoint keys
   * can turn a small document into a very wide table, so this is checked
   * before any CSV text is built.
   */
  maxCells: number;
  /** Characters in the produced CSV. */
  maxOutputChars: number;
}

export const WORKFLOW_LIMITS: Readonly<WorkflowLimits> = {
  maxInputChars: MAX_TEXT_INPUT,
  maxExpressionChars: 1_000,
  maxRows: 10_000,
  maxColumns: 500,
  maxCells: 1_000_000,
  maxOutputChars: 5_000_000,
};

const DELIMITERS: readonly Delimiter[] = [",", ";", "\t", "|"];

export type WorkflowStep = "input" | "parse" | "select" | "convert";

export type WorkflowErrorCode =
  | "input-too-large"
  | "expression-too-long"
  | "invalid-delimiter"
  | "invalid-json"
  | "invalid-jsonpath"
  | "no-matches"
  | "not-tabular"
  | "too-many-rows"
  | "too-many-columns"
  | "output-too-large";

/** Summary of the stages that completed, so a UI can show progress even when a later stage fails. */
export interface WorkflowProgress {
  parse?: {
    rootType: JsonParseOk["rootType"];
    /** Number of top-level keys or items, null for primitives. */
    topLevelCount: number | null;
    /** Up to `MAX_HINT_KEYS` top-level keys of an object root, to hint at valid paths. */
    topLevelKeys: string[];
  };
  select?: {
    matchCount: number;
    rowCount: number;
    unwrapped: boolean;
  };
}

const MAX_HINT_KEYS = 20;

export interface WorkflowError {
  ok: false;
  progress: WorkflowProgress;
  /** Which stage of the workflow failed. */
  step: WorkflowStep;
  /** Stable machine-readable reason; `error` is the human-readable message. */
  code: WorkflowErrorCode;
  error: string;
  /** Position of a JSON syntax error, when the engine reports one. */
  line?: number;
  column?: number;
}

export interface WorkflowOk {
  ok: true;
  progress: WorkflowProgress;
  csv: string;
  /** Header columns. Empty when the rows were arrays rather than objects. */
  columns: string[];
  rowCount: number;
  /** JSONPath matches before any unwrapping. */
  matchCount: number;
  /** True when a single matched array was expanded into rows (e.g. `$.users`). */
  unwrapped: boolean;
  delimiter: Delimiter;
}

export type WorkflowResult = WorkflowOk | WorkflowError;

export interface JsonToCsvWorkflowInput {
  /** Raw JSON text as typed or pasted by the user. */
  json: string;
  /** JSONPath expression, e.g. `$.users[*]` or `$.users`. */
  jsonPath: string;
  /** CSV field delimiter. Defaults to a comma. */
  delimiter?: Delimiter;
}

export interface RowSelection {
  rows: JsonValue[];
  unwrapped: boolean;
}

/**
 * Turn JSONPath matches into CSV rows.
 *
 * - Several matches (`$.users[*]`) become one row each.
 * - A single match whose value is an array (`$.users`) is unwrapped so its
 *   elements become the rows. Any other single match is one row.
 */
export function selectRows(matches: readonly Match[]): RowSelection {
  if (matches.length === 1 && Array.isArray(matches[0].value)) {
    return { rows: matches[0].value, unwrapped: true };
  }
  return { rows: matches.map((m) => m.value), unwrapped: false };
}

function isObjectRow(v: JsonValue): v is { [key: string]: JsonValue } {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function kindOf(v: JsonValue): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** "3 strings", "2 objects and 1 number", ... used to explain why values are not tabular. */
function describeValues(rows: readonly JsonValue[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(kindOf(r), (counts.get(kindOf(r)) ?? 0) + 1);
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${kind}${n === 1 ? "" : "s"}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}

function fail(progress: WorkflowProgress, step: WorkflowStep, code: WorkflowErrorCode, error: string, pos?: { line?: number; column?: number }): WorkflowError {
  return { ok: false, progress, step, code, error, ...pos };
}

/**
 * Run the JSON → JSONPath → CSV workflow.
 *
 * `limits` overrides individual caps; production callers should leave it
 * unset so the defaults in `WORKFLOW_LIMITS` apply.
 */
export function runJsonToCsvWorkflow(input: JsonToCsvWorkflowInput, limits: Partial<WorkflowLimits> = {}): WorkflowResult {
  const lim: WorkflowLimits = { ...WORKFLOW_LIMITS, ...limits };
  const delimiter = input.delimiter ?? ",";
  const progress: WorkflowProgress = {};

  // --- input: cheap checks before any parsing so hostile sizes are rejected in O(1)
  if (!DELIMITERS.includes(delimiter)) {
    return fail(progress, "input", "invalid-delimiter", "Delimiter must be a comma, semicolon, tab or pipe.");
  }
  if (input.json.length > lim.maxInputChars) {
    return fail(progress, "input", "input-too-large", `JSON input is too large (${input.json.length.toLocaleString()} characters, limit ${lim.maxInputChars.toLocaleString()}).`);
  }
  if (input.jsonPath.length > lim.maxExpressionChars) {
    return fail(progress, "input", "expression-too-long", `JSONPath expression is too long (limit ${lim.maxExpressionChars.toLocaleString()} characters).`);
  }

  // --- parse
  const parsed = parseJson(input.json);
  if (!parsed.ok) {
    return fail(progress, "parse", "invalid-json", parsed.error, { line: parsed.line, column: parsed.column });
  }
  progress.parse = {
    rootType: parsed.rootType,
    topLevelCount: parsed.topLevelCount,
    topLevelKeys: parsed.rootType === "object" ? Object.keys(parsed.value as object).slice(0, MAX_HINT_KEYS) : [],
  };

  // --- select
  const query = queryJsonPath(parsed.value, input.jsonPath);
  if (!query.ok) {
    // queryJsonPath caps its own result set; surface that as a row limit rather than a syntax error.
    if (query.error?.startsWith("Too many matches")) {
      return fail(progress, "select", "too-many-rows", `${query.error} At most ${lim.maxRows.toLocaleString()} rows can be converted.`);
    }
    return fail(progress, "select", "invalid-jsonpath", query.error ?? "Invalid JSONPath expression.");
  }
  if (query.matches.length === 0) {
    return fail(progress, "select", "no-matches", "The expression matched nothing. Check the path against the JSON structure.");
  }
  const { rows, unwrapped } = selectRows(query.matches);
  progress.select = { matchCount: query.matches.length, rowCount: rows.length, unwrapped };
  if (rows.length === 0) {
    return fail(progress, "select", "no-matches", "The expression matched an empty array, so there are no rows to convert.");
  }
  if (rows.length > lim.maxRows) {
    return fail(progress, "select", "too-many-rows", `The selection has ${rows.length.toLocaleString()} rows; at most ${lim.maxRows.toLocaleString()} can be converted. Narrow the expression, e.g. with a slice or filter.`);
  }

  // --- convert: validate shape and size before building any CSV text
  const allObjects = rows.every(isObjectRow);
  const allArrays = !allObjects && rows.every(Array.isArray);
  if (!allObjects && !allArrays) {
    return fail(
      progress,
      "convert",
      "not-tabular",
      `The selection contains ${describeValues(rows)}. CSV rows must all be objects (or all arrays). Select the parent objects instead, e.g. $.users[*] rather than $.users[*].name.`,
    );
  }

  let cells = 0;
  if (allObjects) {
    const columns = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) columns.add(k);
      if (columns.size > lim.maxColumns) {
        return fail(progress, "convert", "too-many-columns", `The rows have more than ${lim.maxColumns.toLocaleString()} distinct keys. CSV needs a bounded set of columns; select objects with fewer keys, e.g. a nested object or a filtered subset.`);
      }
    }
    cells = rows.length * columns.size;
  } else {
    for (const r of rows) cells += (r as JsonValue[]).length;
  }
  if (cells > lim.maxCells) {
    return fail(progress, "convert", "output-too-large", `The CSV would have about ${cells.toLocaleString()} cells (limit ${lim.maxCells.toLocaleString()}). Narrow the rows or columns.`);
  }

  let converted: ReturnType<typeof jsonToCsv>;
  try {
    converted = jsonToCsv(rows, delimiter);
  } catch (e) {
    // Nested values are serialised with JSON.stringify, which recurses; absurd depth overflows the stack.
    if (e instanceof RangeError) return fail(progress, "convert", "not-tabular", "A value is nested too deeply to be written as a CSV cell.");
    return fail(progress, "convert", "not-tabular", e instanceof Error ? e.message : "Conversion failed.");
  }
  if (!converted.ok) {
    return fail(progress, "convert", "not-tabular", converted.error ?? "The selected values cannot be written as CSV.");
  }
  if (converted.csv.length > lim.maxOutputChars) {
    return fail(progress, "convert", "output-too-large", `The CSV output is too large (${converted.csv.length.toLocaleString()} characters, limit ${lim.maxOutputChars.toLocaleString()}).`);
  }

  return {
    ok: true,
    progress,
    csv: converted.csv,
    columns: converted.columns,
    rowCount: rows.length,
    matchCount: query.matches.length,
    unwrapped,
    delimiter,
  };
}

export const DEFAULT_WORKFLOW_EXPRESSION = "$.users[*]";

export const WORKFLOW_EXAMPLES: Array<{ expr: string; label: string }> = [
  { expr: "$.users[*]", label: "Every user as a row" },
  { expr: "$.users", label: "Same rows, selecting the array itself" },
  { expr: "$.users[?(@.active)]", label: "Only active users" },
  { expr: "$.users[?(@.role == 'admin')]", label: "Only admins" },
  { expr: "$.users[0:2]", label: "First two users" },
  { expr: "$.meta", label: "One row from a single object" },
];

export const WORKFLOW_SAMPLE = `{
  "users": [
    { "id": 1, "name": "Ada Lovelace", "email": "ada@example.com", "role": "admin", "active": true, "score": 98.5 },
    { "id": 2, "name": "Grace Hopper", "email": "grace@example.com", "role": "dev", "active": true, "score": 91 },
    { "id": 3, "name": "Linus Torvalds", "email": "linus@example.com", "role": "dev", "active": false, "score": 87 },
    { "id": 4, "name": "Margaret Hamilton", "email": "margaret@example.com", "role": "admin", "active": true, "score": 95, "team": "Apollo" }
  ],
  "meta": { "total": 4, "generated": "2026-09-29" }
}`;
