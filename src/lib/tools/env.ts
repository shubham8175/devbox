export interface EnvEntry {
  key: string;
  value: string;
  line: number;
  raw: string;
  exported: boolean;
  quote: '"' | "'" | null;
}

export interface EnvIssue {
  line: number;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  suggestion?: string;
}

export interface EnvParseResult {
  entries: EnvEntry[];
  issues: EnvIssue[];
  /** Last definition wins, like dotenv */
  map: Map<string, EnvEntry>;
  duplicates: Map<string, EnvEntry[]>;
}

export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnv(input: string): EnvParseResult {
  const issues: EnvIssue[] = [];
  const entries: EnvEntry[] = [];
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) {
    issues.push({ line: 1, severity: "warning", code: "bom", message: "File starts with a UTF-8 BOM.", suggestion: "Save the file without BOM; some parsers include it in the first key." });
    text = text.slice(1);
  }
  if (/\r\n/.test(text)) issues.push({ line: 1, severity: "info", code: "crlf", message: "File uses CRLF line endings.", suggestion: "LF is conventional for .env files; CRLF can leave a trailing \\r in values on some tools." });
  const lines = text.split(/\r?\n/);
  let inMultiline: { key: string; quote: '"' | "'"; start: number; buf: string[]; exported: boolean } | null = null;

  lines.forEach((rawLine, i) => {
    const line = i + 1;
    if (inMultiline) {
      const ml: { key: string; quote: '"' | "'"; start: number; buf: string[]; exported: boolean } = inMultiline;
      const endMatch = new RegExp(`${ml.quote}\\s*(#.*)?$`).exec(rawLine);
      const endIdx = endMatch ? endMatch.index : -1;
      if (endIdx >= 0) {
        ml.buf.push(rawLine.slice(0, endIdx));
        entries.push({ key: ml.key, value: ml.buf.join("\n"), line: ml.start, raw: rawLine, exported: ml.exported, quote: ml.quote });
        inMultiline = null;
      } else ml.buf.push(rawLine);
      return;
    }
    if (!rawLine.trim()) return;
    if (/^\s*#/.test(rawLine)) return;
    if (/^\s/.test(rawLine)) issues.push({ line, severity: "warning", code: "leading-ws", message: "Line starts with whitespace.", suggestion: "Remove indentation; some loaders treat the key as invalid." });
    let body = rawLine.trim();
    let exported = false;
    if (/^export\s+/.test(body)) {
      exported = true;
      body = body.replace(/^export\s+/, "");
    }
    const eq = body.indexOf("=");
    if (eq < 0) {
      issues.push({ line, severity: "error", code: "missing-eq", message: "No “=” found on this line.", suggestion: "Use KEY=value. Comments must start with #." });
      return;
    }
    const keyRaw = body.slice(0, eq);
    const key = keyRaw.trim();
    if (keyRaw !== key) issues.push({ line, severity: "warning", code: "key-ws", message: `Whitespace around the key “${key}”.`, suggestion: "Write KEY=value with no spaces around “=”." });
    if (!key) {
      issues.push({ line, severity: "error", code: "empty-key", message: "Empty key before “=”." });
      return;
    }
    if (!ENV_KEY_RE.test(key)) {
      issues.push({ line, severity: "error", code: "invalid-key", message: `Invalid key name “${key}”.`, suggestion: "Use letters, digits and underscores, not starting with a digit (e.g. DATABASE_URL)." });
    } else if (key !== key.toUpperCase()) {
      issues.push({ line, severity: "info", code: "lowercase-key", message: `Key “${key}” is not upper-case.`, suggestion: "UPPER_SNAKE_CASE is conventional for environment variables." });
    }
    let valueRaw = body.slice(eq + 1);
    if (/^\s/.test(valueRaw)) issues.push({ line, severity: "warning", code: "value-leading-ws", message: `Space after “=” for ${key}.`, suggestion: "Most loaders trim it, but shells do not." });
    valueRaw = valueRaw.trim();
    let value = valueRaw;
    let quote: '"' | "'" | null = null;
    if (valueRaw.startsWith('"') || valueRaw.startsWith("'")) {
      const q: '"' | "'" = valueRaw[0] === '"' ? '"' : "'";
      quote = q;
      const closing = valueRaw.indexOf(q, 1);
      if (closing < 0) {
        // Only treat as multi-line if a closing quote exists further down; otherwise report and keep parsing.
        const closer = new RegExp(`${q}\\s*(#.*)?$`);
        const closesLater = lines.slice(i + 1).some((l) => closer.test(l));
        if (closesLater) {
          inMultiline = { key, quote: q, start: line, buf: [valueRaw.slice(1)], exported };
          return;
        }
        issues.push({ line, severity: "error", code: "unterminated-quote", message: `Unterminated quoted value for ${key}.`, suggestion: "Add the closing quote." });
        entries.push({ key, value: valueRaw.slice(1), line, raw: rawLine, exported, quote: q });
        return;
      }
      value = valueRaw.slice(1, closing);
      const rest = valueRaw.slice(closing + 1).trim();
      if (rest && !rest.startsWith("#")) issues.push({ line, severity: "warning", code: "trailing-after-quote", message: `Unexpected text after the closing quote for ${key}.`, suggestion: "Everything after the quote is ignored or breaks parsing." });
      if (quote === '"') value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    } else {
      const hashIdx = valueRaw.search(/\s#/);
      if (hashIdx >= 0) {
        value = valueRaw.slice(0, hashIdx).trim();
        issues.push({ line, severity: "info", code: "inline-comment", message: `Inline comment after ${key}; value cut at “ #”.`, suggestion: "Quote the value if the # is part of it." });
      }
      if (value.endsWith('"') || value.endsWith("'")) issues.push({ line, severity: "error", code: "unbalanced-quote", message: `Unbalanced quote in value for ${key}.`, suggestion: "Start and end the value with the same quote character." });
      if (/\s/.test(value)) issues.push({ line, severity: "warning", code: "unquoted-space", message: `Unquoted value with spaces for ${key}.`, suggestion: "Wrap values containing spaces in double quotes." });
      if (/[$`]/.test(value) && !/^\$\{?[A-Za-z_]/.test(value)) issues.push({ line, severity: "info", code: "shell-chars", message: `Value for ${key} contains $ or backtick.`, suggestion: "Single-quote the value to prevent expansion in shells and some loaders." });
    }
    if (value !== value.trim()) issues.push({ line, severity: "warning", code: "value-trailing-ws", message: `Value for ${key} has leading/trailing whitespace inside quotes.`, suggestion: "Trim it unless the whitespace is intentional." });
    if (value === "") issues.push({ line, severity: "warning", code: "empty-value", message: `${key} is empty.`, suggestion: "Provide a value or remove the key to fall back to defaults." });
    entries.push({ key, value, line, raw: rawLine, exported, quote });
  });

  if (inMultiline) {
    const m = inMultiline as { key: string; start: number };
    issues.push({ line: m.start, severity: "error", code: "unterminated-quote", message: `Unterminated quoted value for ${m.key}.`, suggestion: "Add the closing quote." });
  }

  const map = new Map<string, EnvEntry>();
  const seen = new Map<string, EnvEntry[]>();
  for (const e of entries) {
    map.set(e.key, e);
    const arr = seen.get(e.key) ?? [];
    arr.push(e);
    seen.set(e.key, arr);
  }
  const duplicates = new Map<string, EnvEntry[]>();
  for (const [k, arr] of seen) {
    if (arr.length > 1) {
      duplicates.set(k, arr);
      const same = arr.every((e) => e.value === arr[0].value);
      issues.push({
        line: arr[arr.length - 1].line,
        severity: same ? "warning" : "error",
        code: same ? "duplicate-key" : "duplicate-key-conflict",
        message: `${k} is defined ${arr.length} times (lines ${arr.map((e) => e.line).join(", ")})${same ? " with the same value" : " with different values"}.`,
        suggestion: same ? "Remove the repeated definition." : "Keep one definition; most loaders use the last one, but shells use the first sourced.",
      });
    }
  }
  issues.sort((a, b) => a.line - b.line);
  return { entries, issues, map, duplicates };
}

export function maskValue(v: string): string {
  if (!v) return "";
  return "•".repeat(Math.min(12, Math.max(4, v.length)));
}

export interface EnvDiffResult {
  missingFromA: string[];
  missingFromB: string[];
  inBoth: Array<{ key: string; same: boolean }>;
  emptyA: string[];
  emptyB: string[];
  duplicatesA: string[];
  duplicatesB: string[];
}

export function diffEnv(a: EnvParseResult, b: EnvParseResult): EnvDiffResult {
  const keysA = Array.from(a.map.keys());
  const keysB = Array.from(b.map.keys());
  const setA = new Set(keysA);
  const setB = new Set(keysB);
  return {
    missingFromA: keysB.filter((k) => !setA.has(k)),
    missingFromB: keysA.filter((k) => !setB.has(k)),
    inBoth: keysA.filter((k) => setB.has(k)).map((k) => ({ key: k, same: a.map.get(k)!.value === b.map.get(k)!.value })),
    emptyA: keysA.filter((k) => a.map.get(k)!.value === ""),
    emptyB: keysB.filter((k) => b.map.get(k)!.value === ""),
    duplicatesA: Array.from(a.duplicates.keys()),
    duplicatesB: Array.from(b.duplicates.keys()),
  };
}

export const ENV_SAMPLE = `# Database
DATABASE_URL="postgres://app:secret@localhost:5432/app"
DB_POOL_SIZE=10

# Auth
JWT_SECRET=change-me
SESSION_TTL=
export API_BASE_URL=https://api.example.com
api_key = abc123
DEBUG=true # enable verbose logs
DB_POOL_SIZE=20
BROKEN LINE
GREETING='hello world`;
