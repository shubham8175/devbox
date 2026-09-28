export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface JsonParseOk {
  ok: true;
  value: JsonValue;
  rootType: "object" | "array" | "string" | "number" | "boolean" | "null";
  topLevelCount: number | null;
}

export interface JsonParseError {
  ok: false;
  error: string;
  line?: number;
  column?: number;
}

export type JsonParseResult = JsonParseOk | JsonParseError;

function describeRoot(value: JsonValue): JsonParseOk["rootType"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonParseOk["rootType"];
}

/** Extract a line/column from a native SyntaxError message, when the engine provides a position. */
function locateError(text: string, message: string): { line?: number; column?: number } {
  const m = /position (\d+)/i.exec(message) ?? /at line (\d+) column (\d+)/i.exec(message);
  if (!m) return {};
  if (m.length === 3) return { line: Number(m[1]), column: Number(m[2]) };
  const pos = Number(m[1]);
  const before = text.slice(0, pos);
  const line = before.split("\n").length;
  const column = pos - before.lastIndexOf("\n");
  return { line, column };
}

export function parseJson(text: string): JsonParseResult {
  if (!text.trim()) return { ok: false, error: "Input is empty." };
  try {
    const value = JSON.parse(text) as JsonValue;
    const rootType = describeRoot(value);
    let topLevelCount: number | null = null;
    if (rootType === "array") topLevelCount = (value as JsonValue[]).length;
    else if (rootType === "object") topLevelCount = Object.keys(value as object).length;
    return { ok: true, value, rootType, topLevelCount };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid JSON.";
    return { ok: false, error: friendlyJsonError(message), ...locateError(text, message) };
  }
}

function friendlyJsonError(message: string): string {
  if (/Unexpected token '?\}'?/.test(message) || /Unexpected token ,/.test(message)) {
    return `${message}. Check for a trailing comma.`;
  }
  if (/Unexpected token '?'?'/.test(message) || /single quote/i.test(message)) {
    return `${message}. JSON strings must use double quotes.`;
  }
  if (/Unexpected end of JSON input/.test(message)) {
    return "Unexpected end of input. A bracket, brace or quote is probably missing.";
  }
  return message;
}

export function formatJson(value: JsonValue, indent: number | string = 2): string {
  return JSON.stringify(value, null, indent);
}

export function minifyJson(value: JsonValue): string {
  return JSON.stringify(value);
}

/** Recursively sort object keys (arrays keep their order). */
export function sortKeysDeep(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    // Null prototype so a "__proto__" key becomes an own property instead of touching the prototype.
    const sorted: { [key: string]: JsonValue } = Object.create(null);
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      sorted[key] = sortKeysDeep((value as { [key: string]: JsonValue })[key]);
    }
    return sorted;
  }
  return value;
}
