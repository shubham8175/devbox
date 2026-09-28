export type LogLevel = "FATAL" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE" | "OTHER";

export interface LogEntry {
  index: number;
  raw: string;
  timestamp: string | null;
  level: LogLevel;
  message: string;
  json: unknown | null;
  jsonPretty: string | null;
  repeat: number;
}

export const LOG_LEVELS: LogLevel[] = ["FATAL", "ERROR", "WARN", "INFO", "DEBUG", "TRACE", "OTHER"];

const TS_PATTERNS: RegExp[] = [
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/,
  /\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2}\s?[+-]\d{4}/,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/,
  /\d{2}:\d{2}:\d{2}(?:[.,]\d+)?/,
  /\b\d{10}(?:\.\d+)?\b|\b\d{13}\b/,
];

const LEVEL_RE = /(?:^|[\s[(])(FATAL|CRITICAL|ERROR|ERR|WARNING|WARN|INFO|NOTICE|DEBUG|TRACE|VERBOSE)(?:[\s\]):]|$)/i;
const KV_LEVEL_RE = /\b(?:level|severity|lvl)\s*[=:]\s*"?([A-Za-z]+)"?/i;

function normalizeLevel(s: string | undefined): LogLevel {
  if (!s) return "OTHER";
  const u = s.toUpperCase();
  if (u === "FATAL" || u === "CRITICAL" || u === "EMERG" || u === "ALERT") return "FATAL";
  if (u === "ERROR" || u === "ERR" || u === "E") return "ERROR";
  if (u === "WARN" || u === "WARNING" || u === "W") return "WARN";
  if (u === "INFO" || u === "NOTICE" || u === "I") return "INFO";
  if (u === "DEBUG" || u === "D") return "DEBUG";
  if (u === "TRACE" || u === "VERBOSE" || u === "V") return "TRACE";
  return "OTHER";
}

function numericLevel(n: number): LogLevel {
  // pino / bunyan numeric levels
  if (n >= 60) return "FATAL";
  if (n >= 50) return "ERROR";
  if (n >= 40) return "WARN";
  if (n >= 30) return "INFO";
  if (n >= 20) return "DEBUG";
  return "TRACE";
}

function extractJson(line: string): { json: unknown; start: number; end: number } | null {
  const start = line.search(/[{[]/);
  if (start < 0) return null;
  // Try whole tail first, then trim trailing junk progressively at brace boundaries.
  const tail = line.slice(start);
  const candidates = [tail];
  const lastBrace = Math.max(tail.lastIndexOf("}"), tail.lastIndexOf("]"));
  if (lastBrace > 0 && lastBrace < tail.length - 1) candidates.push(tail.slice(0, lastBrace + 1));
  for (const c of candidates) {
    try {
      const json = JSON.parse(c);
      if (json && typeof json === "object") return { json, start, end: start + c.length };
    } catch {
      // not JSON
    }
  }
  return null;
}

export function parseLogLine(raw: string, index: number): LogEntry {
  const jsonHit = extractJson(raw);
  let timestamp: string | null = null;
  let level: LogLevel = "OTHER";
  let message = raw;

  if (jsonHit) {
    const obj = jsonHit.json as Record<string, unknown>;
    const lv = obj.level ?? obj.severity ?? obj.lvl ?? obj.loglevel;
    if (typeof lv === "number") level = numericLevel(lv);
    else if (typeof lv === "string") level = normalizeLevel(lv);
    const ts = obj.time ?? obj.timestamp ?? obj["@timestamp"] ?? obj.ts ?? obj.date;
    if (typeof ts === "string") timestamp = ts;
    else if (typeof ts === "number") timestamp = new Date(ts < 1e11 ? ts * 1000 : ts).toISOString();
    const msg = obj.msg ?? obj.message ?? obj.event;
    const prefix = raw.slice(0, jsonHit.start).trim();
    message = typeof msg === "string" ? msg : prefix || "(JSON)";
  }
  if (!timestamp) {
    for (const p of TS_PATTERNS) {
      const m = p.exec(raw);
      if (m) {
        timestamp = m[0];
        break;
      }
    }
  }
  if (level === "OTHER") {
    const kv = KV_LEVEL_RE.exec(raw);
    const m = kv ? kv[1] : LEVEL_RE.exec(raw)?.[1];
    level = normalizeLevel(m);
  }
  return {
    index,
    raw,
    timestamp,
    level,
    message,
    json: jsonHit?.json ?? null,
    jsonPretty: jsonHit ? JSON.stringify(jsonHit.json, null, 2) : null,
    repeat: 1,
  };
}

export function parseLogs(input: string, collapseDuplicates: boolean): LogEntry[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const out: LogEntry[] = [];
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const entry = parseLogLine(raw, i);
    const prev = out[out.length - 1];
    if (collapseDuplicates && prev && prev.raw === raw) {
      prev.repeat++;
      return;
    }
    out.push(entry);
  });
  return out;
}

export function countLevels(entries: LogEntry[]): Record<LogLevel, number> {
  const c = { FATAL: 0, ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0, OTHER: 0 } as Record<LogLevel, number>;
  for (const e of entries) c[e.level] += e.repeat;
  return c;
}

export const LOGS_SAMPLE = `2026-09-28T10:15:02.113Z INFO  server listening on :3000
2026-09-28T10:15:03.001Z DEBUG cache warmed keys=42
2026-09-28T10:15:07.420Z WARN  slow query took 812ms {"sql":"SELECT * FROM orders WHERE status = $1","params":["pending"]}
{"level":"error","time":"2026-09-28T10:15:09.000Z","msg":"payment failed","orderId":"ORD-1768999338300","code":"card_declined"}
{"level":50,"time":1790000000000,"msg":"upstream timeout","service":"billing","attempt":3}
2026-09-28T10:15:10.500Z ERROR unhandled rejection: TypeError: Cannot read properties of undefined (reading 'id')
2026-09-28T10:15:10.500Z ERROR unhandled rejection: TypeError: Cannot read properties of undefined (reading 'id')
2026-09-28T10:15:10.500Z ERROR unhandled rejection: TypeError: Cannot read properties of undefined (reading 'id')
Sep 28 10:15:12 host app[1234]: INFO request GET /health 200 2ms
[10:15:13] [TRACE] scheduler tick
level=info ts=2026-09-28T10:15:14Z msg="worker started" id=7`;
