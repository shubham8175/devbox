export interface ParsedHeader {
  name: string;
  value: string;
  /** Number of times this header name appears (case-insensitive) */
  count: number;
  description?: string;
}

export interface ParsedHeaders {
  startLine: string | null;
  headers: ParsedHeader[];
  errors: string[];
}

export const HEADER_DESCRIPTIONS: Record<string, string> = {
  "content-type": "Media type of the body (and charset).",
  "content-length": "Body size in bytes.",
  "content-encoding": "Compression applied to the body (gzip, br…).",
  "cache-control": "Caching directives for clients and proxies.",
  etag: "Version identifier for conditional requests.",
  "last-modified": "When the resource last changed.",
  expires: "Absolute time after which the response is stale.",
  authorization: "Credentials for the request (Bearer, Basic…).",
  "www-authenticate": "Auth scheme the server expects (with 401).",
  cookie: "Cookies sent by the client.",
  "set-cookie": "Cookie the server asks the client to store.",
  accept: "Media types the client can handle.",
  "accept-encoding": "Compression the client accepts.",
  "accept-language": "Preferred languages.",
  "user-agent": "Client software identifier.",
  host: "Target host (and port) of the request.",
  origin: "Origin of the requesting page (CORS).",
  referer: "Page the request came from.",
  location: "Redirect target or URL of a created resource.",
  "access-control-allow-origin": "Origins allowed to read the response (CORS).",
  "access-control-allow-credentials": "Whether credentials may be sent cross-origin.",
  "access-control-allow-methods": "Methods allowed in the preflighted request.",
  "access-control-allow-headers": "Headers allowed in the preflighted request.",
  "strict-transport-security": "Force HTTPS for this host (HSTS).",
  "content-security-policy": "Allowed sources for scripts, styles, etc.",
  "x-frame-options": "Whether the page may be framed.",
  "x-content-type-options": "nosniff: don't guess content types.",
  "referrer-policy": "How much referrer info to send.",
  "permissions-policy": "Browser features the page may use.",
  "x-request-id": "Correlation ID for tracing a request.",
  "x-forwarded-for": "Original client IP behind proxies.",
  "x-forwarded-proto": "Original protocol behind proxies.",
  "retry-after": "When to retry (with 429 / 503).",
  "x-ratelimit-limit": "Request quota for the window.",
  "x-ratelimit-remaining": "Requests left in the window.",
  "x-ratelimit-reset": "When the quota resets.",
  vary: "Request headers that affect the response (caching).",
  connection: "Connection options (keep-alive, close).",
  "keep-alive": "Keep-alive parameters.",
  "transfer-encoding": "Body framing (chunked).",
  date: "When the message was generated.",
  server: "Server software identifier.",
  via: "Proxies the message passed through.",
  age: "Seconds the response sat in a cache.",
  "if-none-match": "Send body only if ETag differs.",
  "if-modified-since": "Send body only if changed since date.",
  "accept-ranges": "Whether range requests are supported.",
  "content-disposition": "Inline display or attachment filename.",
  "content-range": "Which bytes are in a partial response.",
  link: "Related resources (preload, pagination…).",
  "x-powered-by": "Backend technology (often best removed).",
  "alt-svc": "Alternative services (HTTP/3 advertisement).",
  "sec-fetch-mode": "Request mode (cors, navigate…).",
  "sec-fetch-site": "Relationship between origins (same-origin, cross-site…).",
  "sec-fetch-dest": "Destination of the request (document, image…).",
  "upgrade-insecure-requests": "Client prefers HTTPS versions of resources.",
  dnt: "Do Not Track preference.",
  pragma: "Legacy no-cache directive.",
};

export function parseRawHeaders(raw: string): ParsedHeaders {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: ParsedHeaders = { startLine: null, headers: [], errors: [] };
  const list: Array<{ name: string; value: string }> = [];
  let i = 0;
  // Skip leading blank lines
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^(HTTP\/\d(\.\d)?\s+\d{3}|[A-Z]+\s+\S+\s+HTTP\/\d)/.test(lines[i].trim())) {
    out.startLine = lines[i].trim();
    i++;
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^[ \t]/.test(line) && list.length) {
      // obs-fold continuation
      list[list.length - 1].value += " " + line.trim();
      continue;
    }
    const idx = line.indexOf(":");
    if (idx <= 0) {
      out.errors.push(`Line ${i + 1}: no “:” separator — “${line.trim().slice(0, 60)}”.`);
      continue;
    }
    const name = line.slice(0, idx).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) out.errors.push(`Line ${i + 1}: invalid header name “${name}”.`);
    list.push({ name, value: line.slice(idx + 1).trim() });
  }
  const counts = new Map<string, number>();
  for (const h of list) counts.set(h.name.toLowerCase(), (counts.get(h.name.toLowerCase()) ?? 0) + 1);
  out.headers = list.map((h) => ({ ...h, count: counts.get(h.name.toLowerCase()) ?? 1, description: HEADER_DESCRIPTIONS[h.name.toLowerCase()] }));
  return out;
}

/** Headers → JSON object; repeated names become arrays. Names are lower-cased unless preserveCase. */
export function headersToJson(headers: ParsedHeader[], preserveCase = false): Record<string, string | string[]> {
  const obj: Record<string, string | string[]> = {};
  for (const h of headers) {
    const key = preserveCase ? h.name : h.name.toLowerCase();
    const existing = obj[key];
    if (existing === undefined) obj[key] = h.value;
    else if (Array.isArray(existing)) existing.push(h.value);
    else obj[key] = [existing, h.value];
  }
  return obj;
}

/** JSON object (string or string[] values) → raw header text. */
export function jsonToHeaders(input: string): { ok: true; text: string } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "Expected a JSON object of header names to values." };
  const lines: string[] = [];
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    const values = Array.isArray(v) ? v : [v];
    for (const val of values) {
      if (val === null || typeof val === "object") return { ok: false, error: `Header “${k}” must be a string, number or array of strings.` };
      lines.push(`${canonicalHeaderName(k)}: ${String(val)}`);
    }
  }
  return { ok: true, text: lines.join("\n") };
}

export function canonicalHeaderName(name: string): string {
  return name
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
    .join("-");
}

export const HEADERS_SAMPLE = `HTTP/1.1 200 OK
Date: Mon, 28 Sep 2026 10:00:00 GMT
Content-Type: application/json; charset=utf-8
Content-Length: 1234
Cache-Control: no-cache
Set-Cookie: session=abc; Path=/; HttpOnly
Set-Cookie: theme=dark; Path=/
X-Request-Id: 7f3c2a1b
Strict-Transport-Security: max-age=31536000; includeSubDomains
Vary: Accept-Encoding`;
