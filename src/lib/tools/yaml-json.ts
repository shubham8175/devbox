import type { JsonValue } from "@/lib/tools/json";

export interface ConvertResult {
  ok: boolean;
  output: string;
  error?: string;
  line?: number;
  column?: number;
}

/** Minimal surface of the `yaml` package we use, so the lib file stays type-safe without importing it eagerly. */
export interface YamlModule {
  parse: (src: string, opts?: { prettyErrors?: boolean }) => unknown;
  stringify: (value: unknown, opts?: { indent?: number; lineWidth?: number }) => string;
}

interface YamlLikeError {
  message?: string;
  linePos?: Array<{ line: number; col: number }>;
}

function describeError(e: unknown): { message: string; line?: number; column?: number } {
  const err = e as YamlLikeError;
  const message = typeof err?.message === "string" ? err.message.split("\n")[0] : "Could not parse YAML.";
  const pos = err?.linePos?.[0];
  return { message, line: pos?.line, column: pos?.col };
}

/** Convert a JS value returned by the YAML parser into plain JSON (Dates → ISO strings, Maps/Sets → objects/arrays). */
export function toJsonValue(v: unknown): JsonValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : String(v);
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(toJsonValue);
  if (v instanceof Map) return Object.fromEntries(Array.from(v.entries()).map(([k, val]) => [String(k), toJsonValue(val)]));
  if (v instanceof Set) return Array.from(v).map(toJsonValue);
  if (typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, toJsonValue(val)]));
  return String(v);
}

export function yamlToJson(yaml: YamlModule, src: string, indent = 2): ConvertResult {
  if (!src.trim()) return { ok: false, output: "", error: "Input is empty." };
  try {
    const parsed = yaml.parse(src, { prettyErrors: true });
    return { ok: true, output: JSON.stringify(toJsonValue(parsed), null, indent) };
  } catch (e) {
    const d = describeError(e);
    return { ok: false, output: "", error: d.message, line: d.line, column: d.column };
  }
}

export function jsonToYaml(yaml: YamlModule, src: string, indent = 2): ConvertResult {
  if (!src.trim()) return { ok: false, output: "", error: "Input is empty." };
  let value: unknown;
  try {
    value = JSON.parse(src);
  } catch (e) {
    return { ok: false, output: "", error: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}` };
  }
  try {
    return { ok: true, output: yaml.stringify(value, { indent, lineWidth: 0 }) };
  } catch (e) {
    return { ok: false, output: "", error: e instanceof Error ? e.message : "Could not serialise YAML." };
  }
}

export const YAML_SAMPLE = `service:
  name: devbox
  replicas: 3
  ports:
    - 8080
    - 8443
env:
  NODE_ENV: production
  DEBUG: false
tags: [tools, local]
`;

export const JSON_SAMPLE_FOR_YAML = `{
  "service": { "name": "devbox", "replicas": 3, "ports": [8080, 8443] },
  "env": { "NODE_ENV": "production", "DEBUG": false },
  "tags": ["tools", "local"]
}`;
