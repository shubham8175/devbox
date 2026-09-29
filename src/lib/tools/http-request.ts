/**
 * HTTP Request Builder: turns a structured request model into a resolved
 * request (final URL, headers, body) and code for several HTTP clients.
 * Pure string work only: nothing here ever sends a request.
 */

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface KeyValueRow {
  key: string;
  value: string;
  enabled: boolean;
}

export type AuthType = "none" | "bearer" | "basic" | "api-key";

export interface RequestAuth {
  type: AuthType;
  token?: string;
  username?: string;
  password?: string;
  /** Header (or query parameter) name for API keys. Defaults to X-API-Key. */
  headerName?: string;
  in?: "header" | "query";
}

export type BodyType = "none" | "json" | "form" | "multipart" | "raw" | "graphql";

export interface RequestBody {
  type: BodyType;
  /** JSON text, raw text, a GraphQL query, or `key=value` lines for form / multipart. Multipart files use `field=@path`. */
  content: string;
  /** Explicit Content-Type for raw bodies. */
  contentType?: string;
}

export interface RequestModel {
  method: HttpMethod;
  url: string;
  headers: KeyValueRow[];
  query: KeyValueRow[];
  auth: RequestAuth;
  body: RequestBody;
}

export type CodeTarget = "curl" | "fetch" | "axios" | "httpie" | "python" | "go";

export const CODE_TARGETS: Array<{ id: CodeTarget; label: string }> = [
  { id: "curl", label: "cURL" },
  { id: "fetch", label: "fetch" },
  { id: "axios", label: "Axios" },
  { id: "httpie", label: "HTTPie" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
];

export interface ResolvedHeader {
  name: string;
  value: string;
}

export interface FormField {
  name: string;
  value: string;
  file: boolean;
}

export interface ResolvedRequest {
  ok: true;
  method: HttpMethod;
  url: string;
  headers: ResolvedHeader[];
  /** Serialised body. Null for no body and for multipart (see formFields). */
  body: string | null;
  bodyType: BodyType;
  formFields: FormField[];
  bodyBytes: number;
  /** Set when basic auth is used, so generators can use native options (-u, auth=) instead of a raw header. */
  basicAuth: { username: string; password: string } | null;
  warnings: string[];
}

export interface ResolvedError {
  ok: false;
  error: string;
}

const MAX_ROWS = 200;

function encodeQuery(k: string, v: string): string {
  return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
}

/** Parse `key=value` lines (or a `a=1&b=2` string) into pairs. `field=@path` marks a file for multipart. */
export function parseKeyValueLines(content: string): FormField[] {
  const parts = content.includes("\n") ? content.split(/\r?\n/) : content.split("&");
  const out: FormField[] = [];
  for (const raw of parts.slice(0, MAX_ROWS)) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf("=");
    const name = idx >= 0 ? line.slice(0, idx).trim() : line;
    let value = idx >= 0 ? line.slice(idx + 1) : "";
    const file = value.startsWith("@");
    if (file) value = value.slice(1);
    if (name) out.push({ name, value, file });
  }
  return out;
}

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Resolve the model into the exact URL, headers and body a client would send. */
export function buildRequest(model: RequestModel): ResolvedRequest | ResolvedError {
  const warnings: string[] = [];
  let raw = model.url.trim();
  if (!raw) return { ok: false, error: "Enter a URL." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `https://${raw}`;
    warnings.push("No scheme given; https:// was assumed.");
  }
  try {
    new URL(raw);
  } catch {
    return { ok: false, error: "That does not look like a valid URL." };
  }

  // Merge query: existing URL params first, then enabled rows, then an API key in the query.
  const hashIdx = raw.indexOf("#");
  const hash = hashIdx >= 0 ? raw.slice(hashIdx) : "";
  const noHash = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  const qIdx = noHash.indexOf("?");
  const base = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
  const pairs: Array<[string, string]> = [];
  if (qIdx >= 0) new URLSearchParams(noHash.slice(qIdx + 1)).forEach((v, k) => pairs.push([k, v]));
  for (const q of model.query.slice(0, MAX_ROWS)) {
    if (!q.enabled || !q.key.trim()) continue;
    pairs.push([q.key.trim(), q.value]);
  }
  const auth = model.auth;
  if (auth.type === "api-key" && auth.in === "query") pairs.push([auth.headerName?.trim() || "api_key", auth.token ?? ""]);
  const url = pairs.length ? `${base}?${pairs.map(([k, v]) => encodeQuery(k, v)).join("&")}${hash}` : `${base}${hash}`;

  // Headers: case-insensitive names, last one wins.
  const headerMap = new Map<string, ResolvedHeader>();
  const setHeader = (name: string, value: string) => {
    headerMap.delete(name.toLowerCase());
    headerMap.set(name.toLowerCase(), { name, value });
  };
  for (const h of model.headers.slice(0, MAX_ROWS)) {
    if (!h.enabled || !h.key.trim()) continue;
    setHeader(h.key.trim(), h.value.trim());
  }

  // Body
  const body = model.body;
  let bodyText: string | null = null;
  let formFields: FormField[] = [];
  let inferredType: string | null = null;
  switch (body.type) {
    case "json":
      bodyText = body.content;
      inferredType = "application/json";
      if (body.content.trim()) {
        try {
          JSON.parse(body.content);
        } catch {
          warnings.push("The JSON body is not valid JSON; it is sent as-is.");
        }
      }
      break;
    case "form":
      bodyText = parseKeyValueLines(body.content)
        .map((f) => encodeQuery(f.name, f.value).replace(/%20/g, "+"))
        .join("&");
      inferredType = "application/x-www-form-urlencoded";
      break;
    case "multipart":
      formFields = parseKeyValueLines(body.content);
      // The client sets multipart/form-data with its own boundary; a manual header would break it.
      if (headerMap.has("content-type")) {
        headerMap.delete("content-type");
        warnings.push("Content-Type is removed for multipart bodies; the client adds it with the boundary.");
      }
      break;
    case "raw":
      bodyText = body.content;
      inferredType = body.contentType?.trim() || "text/plain";
      break;
    case "graphql":
      bodyText = JSON.stringify({ query: body.content });
      inferredType = "application/json";
      break;
    case "none":
      break;
  }
  if (inferredType && !headerMap.has("content-type")) setHeader("Content-Type", inferredType);
  if ((model.method === "GET" || model.method === "HEAD") && (bodyText !== null || formFields.length)) {
    warnings.push(`${model.method} requests normally carry no body; some clients and servers drop it.`);
  }

  // Auth is applied last so it wins over a stray Authorization row.
  let basicAuth: ResolvedRequest["basicAuth"] = null;
  const hadAuthHeader = headerMap.has("authorization");
  if (auth.type === "bearer") setHeader("Authorization", `Bearer ${auth.token ?? ""}`);
  else if (auth.type === "basic") {
    basicAuth = { username: auth.username ?? "", password: auth.password ?? "" };
    setHeader("Authorization", `Basic ${base64(`${basicAuth.username}:${basicAuth.password}`)}`);
  } else if (auth.type === "api-key" && auth.in !== "query") setHeader(auth.headerName?.trim() || "X-API-Key", auth.token ?? "");
  if (hadAuthHeader && (auth.type === "bearer" || auth.type === "basic")) warnings.push("The Authorization header row was replaced by the Auth tab settings.");

  const bodyBytes = bodyText !== null ? new TextEncoder().encode(bodyText).length : formFields.reduce((n, f) => n + new TextEncoder().encode(`${f.name}=${f.value}`).length, 0);

  return {
    ok: true,
    method: model.method,
    url,
    headers: Array.from(headerMap.values()),
    body: bodyText,
    bodyType: body.type,
    formFields,
    bodyBytes,
    basicAuth,
    warnings,
  };
}

// ---------- code generation ----------

/** POSIX single-quote a string: close, escaped quote, reopen. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function js(s: string): string {
  return JSON.stringify(s);
}

/** Headers minus the Authorization one when a native basic-auth option is used instead. */
function headersFor(r: ResolvedRequest, dropAuth: boolean): ResolvedHeader[] {
  return dropAuth && r.basicAuth ? r.headers.filter((h) => h.name.toLowerCase() !== "authorization") : r.headers;
}

function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

function indentLines(text: string, indent: string): string {
  return text.replace(/\n/g, `\n${indent}`);
}

export function toCurl(r: ResolvedRequest): string {
  const parts: string[] = [`curl${r.method === "GET" ? "" : ` -X ${r.method}`} ${shellQuote(r.url)}`];
  if (r.basicAuth) parts.push(`-u ${shellQuote(`${r.basicAuth.username}:${r.basicAuth.password}`)}`);
  for (const h of headersFor(r, true)) parts.push(`-H ${shellQuote(`${h.name}: ${h.value}`)}`);
  if (r.bodyType === "multipart") {
    for (const f of r.formFields) parts.push(`-F ${shellQuote(`${f.name}=${f.file ? "@" : ""}${f.value}`)}`);
  } else if (r.body !== null) {
    parts.push(`--data-raw ${shellQuote(r.body)}`);
  }
  return parts.join(" \\\n  ");
}

function formDataSnippet(fields: FormField[]): string {
  const lines = fields.map((f) => (f.file ? `formData.append(${js(f.name)}, fileInput.files[0]); // ${f.value}` : `formData.append(${js(f.name)}, ${js(f.value)});`));
  return `const formData = new FormData();\n${lines.join("\n")}\n\n`;
}

function jsHeaders(headers: ResolvedHeader[], indent: string): string {
  return `{\n${headers.map((h) => `${indent}  ${js(h.name)}: ${js(h.value)},`).join("\n")}\n${indent}}`;
}

function jsBody(r: ResolvedRequest, indent: string): string | null {
  if (r.bodyType === "multipart") return "formData";
  if (r.body === null) return null;
  if (r.bodyType === "json") {
    const pretty = prettyJson(r.body);
    if (pretty) return `JSON.stringify(${indentLines(pretty, indent)})`;
  }
  return js(r.body);
}

export function toFetch(r: ResolvedRequest): string {
  const out: string[] = [];
  if (r.bodyType === "multipart") out.push(formDataSnippet(r.formFields));
  const opts: string[] = [];
  if (r.method !== "GET") opts.push(`  method: ${js(r.method)},`);
  if (r.headers.length) opts.push(`  headers: ${jsHeaders(r.headers, "  ")},`);
  const body = jsBody(r, "  ");
  if (body) opts.push(`  body: ${body},`);
  out.push(`const response = await fetch(${js(r.url)}${opts.length ? `, {\n${opts.join("\n")}\n}` : ""});\n`);
  out.push("if (!response.ok) {\n  throw new Error(`Request failed: ${response.status}`);\n}\n");
  out.push(r.method === "HEAD" ? "console.log(Object.fromEntries(response.headers));" : "const data = await response.json();\nconsole.log(data);");
  return out.join("\n");
}

export function toAxios(r: ResolvedRequest): string {
  const out: string[] = ['import axios from "axios";\n'];
  if (r.bodyType === "multipart") out.push(formDataSnippet(r.formFields));
  const opts: string[] = [`  method: ${js(r.method.toLowerCase())},`, `  url: ${js(r.url)},`];
  const headers = headersFor(r, true);
  if (headers.length) opts.push(`  headers: ${jsHeaders(headers, "  ")},`);
  if (r.basicAuth) opts.push(`  auth: { username: ${js(r.basicAuth.username)}, password: ${js(r.basicAuth.password)} },`);
  if (r.bodyType === "multipart") opts.push("  data: formData,");
  else if (r.body !== null) {
    const pretty = r.bodyType === "json" ? prettyJson(r.body) : null;
    opts.push(`  data: ${pretty ? indentLines(pretty, "  ") : js(r.body)},`);
  }
  out.push(`const response = await axios({\n${opts.join("\n")}\n});\n`);
  out.push("console.log(response.data);");
  return out.join("\n");
}

export function toHttpie(r: ResolvedRequest): string {
  const parts: string[] = [];
  let prefix = "";
  const flags: string[] = [];
  const items: string[] = [];
  if (r.basicAuth) flags.push(`--auth ${shellQuote(`${r.basicAuth.username}:${r.basicAuth.password}`)}`);
  const headers = headersFor(r, true).filter((h) => {
    // HTTPie sets Content-Type itself for JSON/form/multipart items.
    const n = h.name.toLowerCase();
    return !(n === "content-type" && (r.bodyType === "json" || r.bodyType === "form" || r.bodyType === "multipart" || r.bodyType === "graphql"));
  });
  for (const h of headers) items.push(shellQuote(`${h.name}:${h.value}`));

  if (r.bodyType === "multipart") {
    flags.push("--multipart");
    for (const f of r.formFields) items.push(f.file ? shellQuote(`${f.name}@${f.value}`) : shellQuote(`${f.name}=${f.value}`));
  } else if (r.bodyType === "form") {
    flags.push("-f");
    for (const f of parseKeyValueLines(r.body ? decodeURIComponent(r.body.replace(/\+/g, " ")) : "")) items.push(shellQuote(`${f.name}=${f.value}`));
  } else if (r.bodyType === "json" && r.body !== null) {
    let parsed: unknown = undefined;
    try {
      parsed = JSON.parse(r.body);
    } catch {
      parsed = undefined;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        items.push(typeof v === "string" ? shellQuote(`${k}=${v}`) : shellQuote(`${k}:=${JSON.stringify(v)}`));
      }
    } else {
      prefix = `echo -n ${shellQuote(r.body)} | `;
    }
  } else if (r.body !== null) {
    prefix = `echo -n ${shellQuote(r.body)} | `;
  }
  parts.push(`${prefix}http${flags.length ? ` ${flags.join(" ")}` : ""} ${r.method} ${shellQuote(r.url)}`);
  parts.push(...items);
  return parts.join(" \\\n  ");
}

/** JSON value → Python literal (True/False/None). */
function pyLiteral(v: unknown, indent: string): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return js(v);
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return `[\n${v.map((x) => `${indent}    ${pyLiteral(x, `${indent}    `)}`).join(",\n")},\n${indent}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, x]) => `${indent}    ${js(k)}: ${pyLiteral(x, `${indent}    `)}`).join(",\n")},\n${indent}}`;
}

export function toPython(r: ResolvedRequest): string {
  const out: string[] = ["import requests", "", `url = ${js(r.url)}`];
  const headers = headersFor(r, true);
  const kwargs: string[] = [];
  if (headers.length) {
    out.push(`headers = {\n${headers.map((h) => `    ${js(h.name)}: ${js(h.value)},`).join("\n")}\n}`);
    kwargs.push("headers=headers");
  }
  if (r.basicAuth) kwargs.push(`auth=(${js(r.basicAuth.username)}, ${js(r.basicAuth.password)})`);
  if (r.bodyType === "multipart") {
    const files = r.formFields.filter((f) => f.file);
    const data = r.formFields.filter((f) => !f.file);
    if (data.length) {
      out.push(`data = {\n${data.map((f) => `    ${js(f.name)}: ${js(f.value)},`).join("\n")}\n}`);
      kwargs.push("data=data");
    }
    if (files.length) {
      out.push(`files = {\n${files.map((f) => `    ${js(f.name)}: open(${js(f.value)}, "rb"),`).join("\n")}\n}`);
      kwargs.push("files=files");
    }
  } else if (r.body !== null) {
    let parsed: unknown = undefined;
    if (r.bodyType === "json" || r.bodyType === "graphql") {
      try {
        parsed = JSON.parse(r.body);
      } catch {
        parsed = undefined;
      }
    }
    if (parsed !== undefined) {
      out.push(`payload = ${pyLiteral(parsed, "")}`);
      kwargs.push("json=payload");
    } else {
      out.push(`payload = ${js(r.body)}`);
      kwargs.push("data=payload");
    }
  }
  out.push("");
  out.push(`response = requests.${r.method.toLowerCase()}(url${kwargs.length ? `, ${kwargs.join(", ")}` : ""})`);
  out.push("response.raise_for_status()");
  out.push(r.method === "HEAD" ? "print(response.headers)" : "print(response.json())");
  return out.join("\n");
}

function goString(s: string): string {
  // Raw strings keep JSON readable; fall back to an escaped literal when a backtick is present.
  return s.includes("`") ? js(s) : `\`${s}\``;
}

export function toGo(r: ResolvedRequest): string {
  const imports = new Set(["fmt", "io", "net/http"]);
  const body: string[] = [];
  let bodyExpr = "nil";
  if (r.bodyType === "multipart") {
    imports.add("bytes").add("mime/multipart").add("os").add("path/filepath");
    body.push("\tvar buf bytes.Buffer", "\tw := multipart.NewWriter(&buf)");
    for (const f of r.formFields) {
      if (f.file) {
        body.push(`\tif f, err := os.Open(${js(f.value)}); err == nil {`, `\t\tpart, _ := w.CreateFormFile(${js(f.name)}, filepath.Base(f.Name()))`, "\t\tio.Copy(part, f)", "\t\tf.Close()", "\t}");
      } else body.push(`\tw.WriteField(${js(f.name)}, ${js(f.value)})`);
    }
    body.push("\tw.Close()", "");
    bodyExpr = "&buf";
  } else if (r.body !== null) {
    imports.add("strings");
    body.push(`\tbody := strings.NewReader(${goString(r.body)})`, "");
    bodyExpr = "body";
  }
  const lines: string[] = ["package main", "", "import (", ...Array.from(imports).sort().map((i) => `\t${js(i)}`), ")", "", "func main() {"];
  lines.push(...body);
  lines.push(`\treq, err := http.NewRequest(${js(r.method)}, ${js(r.url)}, ${bodyExpr})`, "\tif err != nil {", "\t\tpanic(err)", "\t}");
  for (const h of headersFor(r, true)) lines.push(`\treq.Header.Set(${js(h.name)}, ${js(h.value)})`);
  if (r.bodyType === "multipart") lines.push('\treq.Header.Set("Content-Type", w.FormDataContentType())');
  if (r.basicAuth) lines.push(`\treq.SetBasicAuth(${js(r.basicAuth.username)}, ${js(r.basicAuth.password)})`);
  lines.push("", "\tresp, err := http.DefaultClient.Do(req)", "\tif err != nil {", "\t\tpanic(err)", "\t}", "\tdefer resp.Body.Close()", "", "\tdata, _ := io.ReadAll(resp.Body)", "\tfmt.Println(resp.Status)", "\tfmt.Println(string(data))", "}");
  return lines.join("\n");
}

export function generateCode(model: RequestModel, target: CodeTarget): { ok: true; code: string; request: ResolvedRequest } | ResolvedError {
  const r = buildRequest(model);
  if (!r.ok) return r;
  const code = { curl: toCurl, fetch: toFetch, axios: toAxios, httpie: toHttpie, python: toPython, go: toGo }[target](r);
  return { ok: true, code, request: r };
}

export function emptyRequest(): RequestModel {
  return {
    method: "GET",
    url: "",
    headers: [{ key: "", value: "", enabled: true }],
    query: [{ key: "", value: "", enabled: true }],
    auth: { type: "none", in: "header", headerName: "X-API-Key" },
    body: { type: "none", content: "" },
  };
}

export const REQUEST_SAMPLE: RequestModel = {
  method: "POST",
  url: "https://api.example.com/v1/users",
  headers: [
    { key: "Accept", value: "application/json", enabled: true },
    { key: "X-Request-Id", value: "7f3c2a1b", enabled: true },
  ],
  query: [
    { key: "expand", value: "profile", enabled: true },
    { key: "dry_run", value: "true", enabled: false },
  ],
  auth: { type: "bearer", token: "YOUR_TOKEN", in: "header", headerName: "X-API-Key" },
  body: {
    type: "json",
    content: '{\n  "name": "Ada Lovelace",\n  "email": "ada@example.com",\n  "roles": ["admin"]\n}',
  },
};
