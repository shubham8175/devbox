export interface ParsedCurl {
  method: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
  body: string | null;
  bodyType: "json" | "form" | "raw" | "multipart" | null;
  formFields: Array<{ name: string; value: string; file: boolean }>;
  auth: { user: string; password: string } | null;
  insecure: boolean;
  followRedirects: boolean;
  compressed: boolean;
  warnings: string[];
}

/** Shell-style tokenizer supporting single/double quotes, backslashes and line continuations. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  const s = input.replace(/\\\r?\n/g, " ");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) cur += s[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      has = true;
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      cur += s[++i];
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur || has) tokens.push(cur);
      cur = "";
      has = false;
      continue;
    }
    cur += c;
    has = true;
  }
  if (cur || has) tokens.push(cur);
  return tokens;
}

const BOOL_FLAGS = new Set(["-s", "--silent", "-S", "--show-error", "-v", "--verbose", "-i", "--include", "-o", "--output", "-O", "--remote-name", "--fail", "-f", "-#", "--progress-bar", "-N", "--no-buffer", "--http1.1", "--http2", "--http3", "-4", "-6", "--tlsv1.2", "--tlsv1.3", "-g", "--globoff", "-K", "--config"]);
const VALUE_FLAGS = new Set(["--connect-timeout", "-m", "--max-time", "--retry", "-w", "--write-out", "-c", "--cookie-jar", "--cacert", "--cert", "--key", "-x", "--proxy", "--resolve", "--interface", "--limit-rate", "-r", "--range"]);

export function parseCurl(input: string): { ok: true; value: ParsedCurl } | { ok: false; error: string } {
  const tokens = tokenize(input.trim());
  if (!tokens.length) return { ok: false, error: "Paste a cURL command." };
  let i = 0;
  if (tokens[0] === "curl") i = 1;
  else if (!tokens.some((t) => t === "curl")) return { ok: false, error: "Command should start with “curl”." };

  const out: ParsedCurl = {
    method: "",
    url: "",
    headers: [],
    body: null,
    bodyType: null,
    formFields: [],
    auth: null,
    insecure: false,
    followRedirects: false,
    compressed: false,
    warnings: [],
  };
  const dataParts: string[] = [];
  let useGet = false;
  let head = false;
  let jsonFlag = false;

  const next = (flag: string): string => {
    const v = tokens[++i];
    if (v === undefined) throw new Error(`Missing value after ${flag}`);
    return v;
  };

  try {
    for (; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "curl") continue;
      // --flag=value form
      const eq = t.startsWith("--") && t.includes("=") ? t.indexOf("=") : -1;
      const flag = eq > 0 ? t.slice(0, eq) : t;
      const inlineVal = eq > 0 ? t.slice(eq + 1) : null;
      const val = () => (inlineVal !== null ? inlineVal : next(flag));

      switch (flag) {
        case "-X":
        case "--request":
          out.method = val().toUpperCase();
          break;
        case "-H":
        case "--header": {
          const h = val();
          const idx = h.indexOf(":");
          if (idx > 0) out.headers.push({ name: h.slice(0, idx).trim(), value: h.slice(idx + 1).trim() });
          else if (h.endsWith(";")) out.headers.push({ name: h.slice(0, -1).trim(), value: "" });
          else out.warnings.push(`Ignored malformed header “${h}”.`);
          break;
        }
        case "-d":
        case "--data":
        case "--data-raw":
        case "--data-binary":
        case "--data-ascii":
          dataParts.push(val());
          break;
        case "--data-urlencode": {
          const v = val();
          const idx = v.indexOf("=");
          dataParts.push(idx > 0 ? `${v.slice(0, idx)}=${encodeURIComponent(v.slice(idx + 1))}` : encodeURIComponent(v));
          break;
        }
        case "--json":
          dataParts.push(val());
          jsonFlag = true;
          break;
        case "-F":
        case "--form":
        case "--form-string": {
          const v = val();
          const idx = v.indexOf("=");
          const name = idx > 0 ? v.slice(0, idx) : v;
          let value = idx > 0 ? v.slice(idx + 1) : "";
          const file = flag !== "--form-string" && value.startsWith("@");
          if (file) value = value.slice(1);
          out.formFields.push({ name, value, file });
          break;
        }
        case "-u":
        case "--user": {
          const v = val();
          const idx = v.indexOf(":");
          out.auth = idx >= 0 ? { user: v.slice(0, idx), password: v.slice(idx + 1) } : { user: v, password: "" };
          break;
        }
        case "-A":
        case "--user-agent":
          out.headers.push({ name: "User-Agent", value: val() });
          break;
        case "-e":
        case "--referer":
          out.headers.push({ name: "Referer", value: val() });
          break;
        case "-b":
        case "--cookie": {
          const v = val();
          if (v.includes("=")) out.headers.push({ name: "Cookie", value: v });
          else out.warnings.push("Cookie file reference ignored.");
          break;
        }
        case "--url":
          out.url = val();
          break;
        case "-G":
        case "--get":
          useGet = true;
          break;
        case "-I":
        case "--head":
          head = true;
          break;
        case "-k":
        case "--insecure":
          out.insecure = true;
          break;
        case "-L":
        case "--location":
          out.followRedirects = true;
          break;
        case "--compressed":
          out.compressed = true;
          break;
        default:
          if (VALUE_FLAGS.has(flag)) {
            if (inlineVal === null) i++;
            out.warnings.push(`Option ${flag} is not represented in generated code.`);
          } else if (BOOL_FLAGS.has(flag)) {
            if ((flag === "-o" || flag === "--output") && inlineVal === null) i++;
          } else if (flag.startsWith("-") && flag.length > 1) {
            out.warnings.push(`Unknown option ${flag} ignored.`);
          } else if (!out.url) {
            out.url = t;
          } else {
            out.warnings.push(`Extra argument “${t}” ignored.`);
          }
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not parse command." };
  }

  if (!out.url) return { ok: false, error: "No URL found in the command." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(out.url)) out.url = `http://${out.url}`;

  if (out.formFields.length) {
    out.bodyType = "multipart";
  } else if (dataParts.length) {
    const body = dataParts.join("&");
    if (useGet) {
      const u = new URL(out.url);
      const extra = new URLSearchParams(body);
      extra.forEach((v, k) => u.searchParams.append(k, v));
      out.url = u.toString();
    } else {
      out.body = body;
      const ct = out.headers.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
      if (jsonFlag || /json/i.test(ct)) out.bodyType = "json";
      else if (/x-www-form-urlencoded/i.test(ct)) out.bodyType = "form";
      else if (!ct && /^\s*[{[]/.test(body)) {
        out.bodyType = "json";
        out.warnings.push("Body looks like JSON; curl would send it as application/x-www-form-urlencoded unless a Content-Type header is set.");
      } else if (!ct) {
        out.bodyType = "form";
        out.headers.push({ name: "Content-Type", value: "application/x-www-form-urlencoded" });
      } else out.bodyType = "raw";
      if (jsonFlag && !ct) out.headers.push({ name: "Content-Type", value: "application/json" });
    }
  }

  if (!out.method) out.method = head ? "HEAD" : out.body !== null || out.formFields.length ? "POST" : "GET";
  if (out.auth) {
    const token = typeof btoa === "function" ? btoa(`${out.auth.user}:${out.auth.password}`) : "";
    if (!out.headers.some((h) => h.name.toLowerCase() === "authorization")) out.headers.push({ name: "Authorization", value: `Basic ${token}` });
  }
  if (out.insecure) out.warnings.push("-k/--insecure has no equivalent in browser fetch; TLS verification cannot be disabled.");
  return { ok: true, value: out };
}

// ---------- code generation ----------

function js(s: string): string {
  return JSON.stringify(s);
}

function headersObject(headers: ParsedCurl["headers"], indent = "  "): string {
  if (!headers.length) return "";
  return `{\n${headers.map((h) => `${indent}  ${js(h.name)}: ${js(h.value)}`).join(",\n")}\n${indent}}`;
}

function bodyLiteral(p: ParsedCurl): string | null {
  if (p.formFields.length) return null;
  if (p.body === null) return null;
  if (p.bodyType === "json") {
    try {
      return `JSON.stringify(${JSON.stringify(JSON.parse(p.body), null, 2).replace(/\n/g, "\n  ")})`;
    } catch {
      return js(p.body);
    }
  }
  return js(p.body);
}

function formDataSnippet(p: ParsedCurl): string {
  return `const formData = new FormData();\n${p.formFields
    .map((f) => (f.file ? `formData.append(${js(f.name)}, fileInput.files[0]); // ${f.value}` : `formData.append(${js(f.name)}, ${js(f.value)});`))
    .join("\n")}\n\n`;
}

export function toFetch(p: ParsedCurl, node = false): string {
  const lines: string[] = [];
  if (node) lines.push('// Node 18+ has a global fetch; for older versions: import fetch from "node-fetch";\n');
  if (p.formFields.length) lines.push(formDataSnippet(p));
  const opts: string[] = [];
  if (p.method !== "GET") opts.push(`  method: ${js(p.method)}`);
  const hdrs = headersObject(p.headers);
  if (hdrs) opts.push(`  headers: ${hdrs}`);
  if (p.formFields.length) opts.push("  body: formData");
  else {
    const b = bodyLiteral(p);
    if (b) opts.push(`  body: ${b}`);
  }
  if (p.followRedirects) opts.push('  redirect: "follow"');
  const optsStr = opts.length ? `, {\n${opts.join(",\n")}\n}` : "";
  lines.push(`const response = await fetch(${js(p.url)}${optsStr});\n`);
  lines.push(`if (!response.ok) {\n  throw new Error(\`Request failed: \${response.status}\`);\n}\n`);
  lines.push(p.method === "HEAD" ? "console.log(response.headers);" : "const data = await response.json();\nconsole.log(data);");
  return lines.join("\n");
}

export function toAxios(p: ParsedCurl): string {
  const lines: string[] = ['import axios from "axios";\n'];
  if (p.formFields.length) lines.push(formDataSnippet(p));
  const opts: string[] = [`  method: ${js(p.method.toLowerCase())}`, `  url: ${js(p.url)}`];
  const hdrs = headersObject(p.headers);
  if (hdrs) opts.push(`  headers: ${hdrs}`);
  if (p.formFields.length) opts.push("  data: formData");
  else if (p.body !== null) {
    if (p.bodyType === "json") {
      try {
        opts.push(`  data: ${JSON.stringify(JSON.parse(p.body), null, 2).replace(/\n/g, "\n  ")}`);
      } catch {
        opts.push(`  data: ${js(p.body)}`);
      }
    } else opts.push(`  data: ${js(p.body)}`);
  }
  if (!p.followRedirects) opts.push("  maxRedirects: 0");
  lines.push(`const response = await axios({\n${opts.join(",\n")}\n});\n`);
  lines.push("console.log(response.data);");
  return lines.join("\n");
}

export const CURL_SAMPLE = `curl -X POST 'https://api.example.com/v1/orders?expand=items' \\
  -H 'Authorization: Bearer YOUR_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"sku":"A1","qty":2}' \\
  --compressed -L`;
