export type FrameOrigin = "app" | "framework" | "system" | "unknown";
export type TracePlatform = "javascript" | "android" | "ios" | "unknown";

export interface Frame {
  raw: string;
  fn: string | null;
  file: string | null;
  line: number | null;
  column: number | null;
  origin: FrameOrigin;
  /** Position within the original input, 0-based */
  index: number;
}

export interface TraceBlock {
  /** "Error: message" or "Caused by: …" line */
  message: string | null;
  frames: Frame[];
}

export interface ParsedTrace {
  platform: TracePlatform;
  blocks: TraceBlock[];
  appFrames: Frame[];
  files: Array<{ file: string; line: number | null; column: number | null; count: number }>;
  cleaned: string;
  frameCount: number;
}

const FRAMEWORK_PATTERNS: RegExp[] = [
  /node_modules/,
  /^node:/,
  /\binternal\//,
  /\(native\)/,
  /<anonymous>/,
  /webpack(-internal)?:/,
  /react-dom|react-native|react-refresh|scheduler|hermes|metro|RCT|jest-|expo\//i,
  /^(android|androidx|java|javax|kotlin|kotlinx|dalvik|sun|com\.android|com\.google|com\.facebook|okhttp3|retrofit2|io\.reactivex|org\.junit|org\.gradle)\./,
  /\b(UIKit|Foundation|CoreFoundation|libsystem|libdispatch|libdyld|libobjc|GraphicsServices|SwiftUI|CoreGraphics|QuartzCore|Combine|libswiftCore)\b/,
  /^(<unknown>|Unknown)/,
];

function classify(file: string | null, fn: string | null, raw: string): FrameOrigin {
  const hay = `${fn ?? ""} ${file ?? ""} ${raw}`;
  if (/\b(UIKit|Foundation|CoreFoundation|libsystem|libdispatch|libdyld|libobjc|GraphicsServices|node:|internal\/|\(native\))/.test(hay)) return "system";
  if (FRAMEWORK_PATTERNS.some((p) => p.test(hay))) return "framework";
  if (file || fn) return "app";
  return "unknown";
}

function parseLocation(loc: string): { file: string | null; line: number | null; column: number | null } {
  const m = /^(.*?):(\d+)(?::(\d+))?$/.exec(loc.trim());
  if (!m) return { file: loc.trim() || null, line: null, column: null };
  return { file: m[1], line: Number(m[2]), column: m[3] !== undefined ? Number(m[3]) : null };
}

const MESSAGE_RE = /^(?:Caused by:\s*)?([A-Za-z_$][\w$.]*(?:Error|Exception|Throwable|Failure|Warning|Fault)|Fatal Exception|Uncaught|Unhandled|FATAL EXCEPTION|Exception)[:\s].*$|^(?:Caused by:).*$/;

export function parseStackTrace(input: string): ParsedTrace {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: TraceBlock[] = [];
  let current: TraceBlock = { message: null, frames: [] };
  let platform: TracePlatform = "unknown";
  const cleanedLines: string[] = [];

  const push = () => {
    if (current.message !== null || current.frames.length) blocks.push(current);
    current = { message: null, frames: [] };
  };

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    // Frame regexes are quadratic on pathological lines; real stack frames are never this long.
    if (line.length > 2000) return;

    // JS / Node: "at fn (file:line:col)" | "at file:line:col" | hermes "at fn (address at file:1:2)"
    let m = /^at\s+(?:(.+?)\s+\()?(?:address at\s+)?([^()]+?)\)?$/.exec(line);
    if (m && !/^at\s+[\w.$]+\.[\w$<>]+\([A-Za-z0-9_$]+\.(java|kt|scala|groovy):\d+\)$/.test(line)) {
      const fn = m[1]?.trim() ?? null;
      const loc = m[2].replace(/^address at\s+/, "");
      const { file, line: ln, column } = parseLocation(loc);
      platform = platform === "unknown" ? "javascript" : platform;
      current.frames.push({ raw: line, fn, file, line: ln, column, origin: classify(file, fn, line), index });
      return;
    }
    // Android / Java: "at pkg.Class.method(File.java:123)" or "(Native Method)"
    m = /^at\s+([\w$.<>]+)\(([^)]*)\)$/.exec(line);
    if (m) {
      const fn = m[1];
      const inner = m[2];
      const { file, line: ln } = /Native Method|Unknown Source/.test(inner) ? { file: inner, line: null } : parseLocation(inner);
      platform = "android";
      current.frames.push({ raw: line, fn, file, line: ln, column: null, origin: classify(fn, fn, line), index });
      return;
    }
    // Firefox / Safari / RN: "fn@file:line:col"
    m = /^([\w$<>.\s]*)@(.+:\d+(?::\d+)?)$/.exec(line);
    if (m) {
      const fn = m[1].trim() || null;
      const { file, line: ln, column } = parseLocation(m[2]);
      platform = platform === "unknown" ? "javascript" : platform;
      current.frames.push({ raw: line, fn, file, line: ln, column, origin: classify(file, fn, line), index });
      return;
    }
    // iOS / macOS symbolicated: "3   MyApp   0x0000000102a4b1c8 -[ViewController viewDidLoad] + 84"
    m = /^\d+\s+(\S+)\s+0x[0-9a-fA-F]+\s+(.+?)(?:\s+\+\s+\d+)?$/.exec(line);
    if (m) {
      const moduleName = m[1];
      const fn = m[2];
      platform = "ios";
      const isSystem = /^(UIKit|Foundation|CoreFoundation|libsystem\S*|libdispatch\S*|libdyld\S*|libobjc\S*|GraphicsServices|SwiftUI|CoreGraphics|QuartzCore|libswiftCore\S*|Combine|FrontBoardServices)$/.test(moduleName);
      current.frames.push({ raw: line, fn, file: moduleName, line: null, column: null, origin: isSystem ? "system" : "app", index });
      return;
    }
    // Swift runtime "Fatal error: …" or messages
    if (MESSAGE_RE.test(line) || /^(Error|TypeError|ReferenceError|RangeError|SyntaxError|Fatal error|FATAL|E\/AndroidRuntime|Terminating app)/.test(line)) {
      if (current.frames.length || current.message) push();
      current.message = line.replace(/^E\/AndroidRuntime\(\s*\d+\):\s*/, "");
      cleanedLines.push(current.message);
      return;
    }
    // Something else (e.g. "  ... 12 more", react component stack, logcat prefix)
    if (/^\.\.\.\s*\d+\s+more/.test(line)) {
      current.frames.push({ raw: line, fn: null, file: null, line: null, column: null, origin: "framework", index });
      return;
    }
    if (!current.message && current.frames.length === 0) {
      current.message = line;
      cleanedLines.push(line);
    }
  });
  push();

  const frames = blocks.flatMap((b) => b.frames);
  const appFrames = frames.filter((f) => f.origin === "app");
  const fileMap = new Map<string, { file: string; line: number | null; column: number | null; count: number }>();
  for (const f of appFrames) {
    if (!f.file) continue;
    const key = `${f.file}:${f.line ?? ""}:${f.column ?? ""}`;
    const e = fileMap.get(key);
    if (e) e.count++;
    else fileMap.set(key, { file: f.file, line: f.line, column: f.column, count: 1 });
  }

  const cleaned = blocks
    .map((b) => {
      const head = b.message ? [b.message] : [];
      const body: string[] = [];
      let skipped = 0;
      for (const f of b.frames) {
        if (f.origin === "app" || f.origin === "unknown") {
          if (skipped) body.push(`    … ${skipped} framework/system frame${skipped === 1 ? "" : "s"} omitted`);
          skipped = 0;
          body.push(`    ${f.raw}`);
        } else skipped++;
      }
      if (skipped) body.push(`    … ${skipped} framework/system frame${skipped === 1 ? "" : "s"} omitted`);
      return [...head, ...body].join("\n");
    })
    .join("\n");

  return { platform, blocks, appFrames, files: Array.from(fileMap.values()), cleaned, frameCount: frames.length };
}

export const STACK_TRACE_SAMPLE = `TypeError: Cannot read properties of undefined (reading 'id')
    at getUserId (/app/src/services/user.ts:42:18)
    at async handler (/app/src/routes/profile.ts:17:22)
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)
    at next (/app/node_modules/express/lib/router/route.js:149:13)
    at Route.dispatch (/app/node_modules/express/lib/router/route.js:119:3)
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)
    at /app/node_modules/express/lib/router/index.js:284:15
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at renderProfile (/app/src/views/profile.ts:8:3)`;
