/**
 * nginx location tester: a tolerant config parser plus a simulation of
 * nginx's location selection, rewrite and target resolution rules.
 * Pure string work; nothing here touches the DOM.
 */

export const MAX_NGINX_CONFIG_CHARS = 200_000;
export const MAX_REGEX_LENGTH = 500;
const MAX_URI_LENGTH = 2000;
const MAX_REWRITE_ITERATIONS = 10;

export interface NginxDirective {
  name: string;
  args: string[];
  line: number;
  block?: NginxDirective[];
}

export type LocationModifier = "=" | "^~" | "~" | "~*" | "";

export interface NginxLocation {
  modifier: LocationModifier;
  uri: string;
  line: number;
  /** Directives inside the block, excluding nested locations. */
  directives: NginxDirective[];
  children: NginxLocation[];
  /** Position in document order (regex locations are tried in this order). */
  order: number;
}

export interface NginxConfig {
  ok: true;
  directives: NginxDirective[];
  /** Top-level locations of the server block being tested. */
  locations: NginxLocation[];
  /** Server-level directives (root, rewrite, return…) that locations inherit from. */
  serverDirectives: NginxDirective[];
  servers: number;
  warnings: string[];
}

export interface NginxParseError {
  ok: false;
  error: string;
}

/* --------------------------------- tokenizer -------------------------------- */

interface Token {
  type: "word" | "{" | "}" | ";";
  value: string;
  line: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "#") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "{" || ch === "}" || ch === ";") {
      tokens.push({ type: ch, value: ch, line });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = line;
      let value = "";
      i++;
      while (i < n && text[i] !== quote) {
        // nginx only unescapes the quote character and backslash inside quotes; "\d" stays as written.
        if (text[i] === "\\" && i + 1 < n && (text[i + 1] === quote || text[i + 1] === "\\")) {
          value += text[i + 1];
          i += 2;
          continue;
        }
        if (text[i] === "\n") line++;
        value += text[i++];
      }
      i++; // closing quote (or EOF)
      tokens.push({ type: "word", value, line: start });
      continue;
    }
    let value = "";
    while (i < n && !/[\s;{}#]/.test(text[i])) {
      if (text[i] === "\\" && i + 1 < n && /[\s;{}#]/.test(text[i + 1])) {
        value += text[i + 1];
        i += 2;
        continue;
      }
      value += text[i++];
    }
    tokens.push({ type: "word", value, line });
  }
  return tokens;
}

function parseBlock(tokens: Token[], pos: { i: number }, warnings: string[], depth: number): { dirs: NginxDirective[]; closed: boolean } {
  const out: NginxDirective[] = [];
  while (pos.i < tokens.length) {
    const t = tokens[pos.i];
    if (t.type === "}") {
      if (depth === 0) {
        warnings.push(`Line ${t.line}: unexpected “}”.`);
        pos.i++;
        continue;
      }
      pos.i++;
      return { dirs: out, closed: true };
    }
    if (t.type === ";" || t.type === "{") {
      warnings.push(`Line ${t.line}: unexpected “${t.value}”.`);
      pos.i++;
      continue;
    }
    const name = t.value;
    const line = t.line;
    const args: string[] = [];
    pos.i++;
    while (pos.i < tokens.length && tokens[pos.i].type === "word") args.push(tokens[pos.i++].value);
    if (pos.i >= tokens.length) {
      warnings.push(`Line ${line}: “${name}” is not terminated with “;”.`);
      out.push({ name, args, line });
      break;
    }
    const end = tokens[pos.i];
    if (end.type === ";") {
      pos.i++;
      out.push({ name, args, line });
    } else if (end.type === "{") {
      pos.i++;
      const inner = parseBlock(tokens, pos, warnings, depth + 1);
      if (!inner.closed) warnings.push(`Line ${line}: block “${name}” is never closed.`);
      out.push({ name, args, line, block: inner.dirs });
    } else {
      warnings.push(`Line ${line}: “${name}” is missing “;” before “}”.`);
      out.push({ name, args, line });
    }
  }
  return { dirs: out, closed: depth === 0 };
}

const MODIFIERS = new Set<string>(["=", "^~", "~", "~*"]);

function buildLocations(dirs: NginxDirective[], counter: { n: number }, warnings: string[]): NginxLocation[] {
  const out: NginxLocation[] = [];
  for (const d of dirs) {
    if (d.name !== "location") continue;
    let modifier: LocationModifier = "";
    let uri = "";
    if (d.args.length >= 2 && MODIFIERS.has(d.args[0])) {
      modifier = d.args[0] as LocationModifier;
      uri = d.args.slice(1).join(" ");
    } else if (d.args.length >= 1) {
      uri = d.args.join(" ");
      if (d.args.length > 1) warnings.push(`Line ${d.line}: location has ${d.args.length} arguments; expected [modifier] uri.`);
    } else {
      warnings.push(`Line ${d.line}: location without a URI is ignored.`);
      continue;
    }
    const block = d.block ?? [];
    const loc: NginxLocation = { modifier, uri, line: d.line, directives: block.filter((x) => x.name !== "location"), children: [], order: counter.n++ };
    loc.children = buildLocations(block, counter, warnings);
    if (modifier === "=" && loc.children.length) warnings.push(`Line ${d.line}: an exact (=) location cannot contain nested locations.`);
    out.push(loc);
  }
  return out;
}

function findServers(dirs: NginxDirective[]): NginxDirective[] {
  const out: NginxDirective[] = [];
  for (const d of dirs) {
    if (d.name === "server" && d.block) out.push(d);
    else if (d.block && (d.name === "http" || d.name === "stream")) out.push(...findServers(d.block));
  }
  return out;
}

export function parseNginxConfig(input: string): NginxConfig | NginxParseError {
  if (!input.trim()) return { ok: false, error: "Paste an nginx config with at least one location block." };
  if (input.length > MAX_NGINX_CONFIG_CHARS) return { ok: false, error: `Config is larger than ${MAX_NGINX_CONFIG_CHARS / 1000} KB.` };
  const warnings: string[] = [];
  const directives = parseBlock(tokenize(input), { i: 0 }, warnings, 0).dirs;
  const servers = findServers(directives);
  let serverBlock: NginxDirective[];
  if (servers.length === 0) {
    serverBlock = directives;
    if (!directives.some((d) => d.name === "location")) {
      const inHttp = directives.find((d) => d.name === "http")?.block;
      if (inHttp?.some((d) => d.name === "location")) serverBlock = inHttp;
    }
  } else {
    serverBlock = servers[0].block ?? [];
    if (servers.length > 1) warnings.push(`${servers.length} server blocks found; only the first (line ${servers[0].line}) is tested.`);
  }
  const locations = buildLocations(serverBlock, { n: 0 }, warnings);
  if (!locations.length) warnings.push("No location blocks found; every request falls through to the server-level configuration.");
  return { ok: true, directives, locations, serverDirectives: serverBlock.filter((d) => d.name !== "location"), servers: servers.length, warnings };
}

/* ----------------------------- PCRE → JS regex ------------------------------ */

const POSIX_CLASSES: Record<string, string> = {
  "[:alpha:]": "a-zA-Z",
  "[:digit:]": "0-9",
  "[:alnum:]": "a-zA-Z0-9",
  "[:upper:]": "A-Z",
  "[:lower:]": "a-z",
  "[:space:]": "\\s",
  "[:blank:]": " \\t",
  "[:xdigit:]": "0-9A-Fa-f",
  "[:word:]": "\\w",
  "[:punct:]": "!-\\/:-@\\[-`{-~",
};

export interface CompiledRegex {
  ok: true;
  regex: RegExp;
  notes: string[];
}

export function pcreToJs(pattern: string, caseInsensitive: boolean): CompiledRegex | { ok: false; error: string } {
  if (pattern.length > MAX_REGEX_LENGTH) return { ok: false, error: `Regex longer than ${MAX_REGEX_LENGTH} characters is not evaluated.` };
  const notes: string[] = [];
  let src = pattern;
  let flags = caseInsensitive ? "i" : "";
  const inline = /^\(\?([imsx]+)\)/.exec(src);
  if (inline) {
    if (inline[1].includes("i") && !flags.includes("i")) flags += "i";
    if (inline[1].includes("s")) flags += "s";
    if (inline[1].includes("x")) notes.push("(?x) extended mode is not supported; whitespace is matched literally.");
    src = src.slice(inline[0].length);
  }
  src = src.replace(/\(\?P<([A-Za-z_]\w*)>/g, "(?<$1>").replace(/\(\?P=([A-Za-z_]\w*)\)/g, "\\k<$1>");
  if (src.includes("(?>")) {
    notes.push("Atomic groups (?>…) are treated as plain groups.");
    src = src.replace(/\(\?>/g, "(?:");
  }
  for (const [posix, js] of Object.entries(POSIX_CLASSES)) src = src.split(posix).join(js);
  // \A, \Z, \z and possessive quantifiers, skipping escaped characters.
  let out = "";
  let possessive = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\" && i + 1 < src.length) {
      const nx = src[i + 1];
      if (nx === "A") out += "^";
      else if (nx === "Z" || nx === "z") out += "$";
      else out += c + nx;
      i++;
      continue;
    }
    if ((c === "+" || c === "*" || c === "?" || c === "}") && src[i + 1] === "+") {
      out += c;
      possessive = true;
      i++;
      continue;
    }
    out += c;
  }
  if (possessive) notes.push("Possessive quantifiers (a++) are treated as greedy.");
  try {
    return { ok: true, regex: new RegExp(out, flags), notes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.replace(/^Invalid regular expression: /, "") : "Invalid regular expression." };
  }
}

/* ------------------------------ location matching --------------------------- */

export interface LocationCandidate {
  location: NginxLocation;
  matched: boolean;
  note: string;
}

export interface LocationMatch {
  matched: NginxLocation | null;
  steps: string[];
  candidates: LocationCandidate[];
  /** Capture groups when a regex location won (index 0 = whole match). */
  captures: string[];
}

export function describeLocation(loc: NginxLocation): string {
  return loc.modifier ? `${loc.modifier} ${loc.uri}` : loc.uri;
}

export function matchLocation(locations: NginxLocation[], uri: string, depth = 0): LocationMatch {
  const steps: string[] = [];
  const candidates: LocationCandidate[] = [];
  const indent = depth ? "↳ " : "";
  const finish = (loc: NginxLocation | null, captures: string[] = []): LocationMatch => {
    if (loc && loc.children.length && depth < 5) {
      steps.push(`${indent}“${describeLocation(loc)}” has ${loc.children.length} nested location${loc.children.length === 1 ? "" : "s"}; searching inside it.`);
      const inner = matchLocation(loc.children, uri, depth + 1);
      steps.push(...inner.steps);
      candidates.push(...inner.candidates);
      if (inner.matched) return { matched: inner.matched, steps, candidates, captures: inner.captures };
      steps.push(`${indent}No nested location matched; staying in “${describeLocation(loc)}”.`);
    }
    return { matched: loc, steps, candidates, captures };
  };

  // 1. Exact matches win immediately.
  const exact = locations.filter((l) => l.modifier === "=");
  for (const l of exact) {
    if (l.uri === uri) {
      candidates.push({ location: l, matched: true, note: "exact match" });
      steps.push(`${indent}Exact location “= ${l.uri}” equals the URI — search stops here.`);
      return finish(l);
    }
    candidates.push({ location: l, matched: false, note: "URI differs" });
  }
  if (exact.length) steps.push(`${indent}No exact (=) location equals “${uri}”.`);

  // 2. Longest prefix among plain and ^~ locations.
  let best: NginxLocation | null = null;
  for (const l of locations) {
    if (l.modifier !== "" && l.modifier !== "^~") continue;
    const hit = uri.startsWith(l.uri);
    if (hit && (!best || l.uri.length > best.uri.length)) best = l;
    candidates.push({ location: l, matched: false, note: hit ? "prefix matches" : "prefix does not match" });
  }
  if (best) {
    steps.push(`${indent}Longest matching prefix is “${describeLocation(best)}” (${best.uri.length} chars).`);
    if (best.modifier === "^~") {
      steps.push(`${indent}It has the ^~ modifier, so regular-expression locations are skipped.`);
      const c = candidates.find((x) => x.location === best);
      if (c) {
        c.matched = true;
        c.note = "longest prefix, ^~ stops regex search";
      }
      return finish(best);
    }
  } else if (locations.some((l) => l.modifier === "" || l.modifier === "^~")) steps.push(`${indent}No prefix location matches the start of “${uri}”.`);

  // 3. Regex locations in order of appearance.
  const regexes = locations.filter((l) => l.modifier === "~" || l.modifier === "~*").sort((a, b) => a.order - b.order);
  if (regexes.length) steps.push(`${indent}Checking ${regexes.length} regex location${regexes.length === 1 ? "" : "s"} in order of appearance.`);
  const safeUri = uri.slice(0, MAX_URI_LENGTH);
  for (const l of regexes) {
    const compiled = pcreToJs(l.uri, l.modifier === "~*");
    if (!compiled.ok) {
      candidates.push({ location: l, matched: false, note: `not evaluated: ${compiled.error}` });
      steps.push(`${indent}“${describeLocation(l)}” could not be compiled (${compiled.error}); skipped.`);
      continue;
    }
    const m = compiled.regex.exec(safeUri);
    if (m) {
      candidates.push({ location: l, matched: true, note: `regex matches${compiled.notes.length ? ` (${compiled.notes.join(" ")})` : ""}` });
      steps.push(`${indent}Regex “${describeLocation(l)}” matches${l.modifier === "~*" ? " (case-insensitive)" : ""} — the first matching regex wins.`);
      return finish(l, Array.from(m));
    }
    candidates.push({ location: l, matched: false, note: "regex does not match" });
  }

  // 4. Fall back to the longest prefix.
  if (best) {
    steps.push(`${indent}${regexes.length ? "No regex matched; " : ""}using the longest prefix “${describeLocation(best)}”.`);
    const c = candidates.find((x) => x.location === best);
    if (c) {
      c.matched = true;
      c.note = "longest prefix";
    }
    return finish(best);
  }
  steps.push(`${indent}No location matches; nginx serves the request with the server-level configuration.`);
  return { matched: null, steps, candidates, captures: [] };
}

/* ---------------------------------- rewrites -------------------------------- */

export interface RewriteStep {
  line: number;
  regex: string;
  replacement: string;
  flag: string;
  matched: boolean;
  from: string;
  to?: string;
  note: string;
}

export interface RewriteResult {
  uri: string;
  steps: RewriteStep[];
  stopped: "none" | "break" | "last" | "redirect" | "permanent" | "loop";
  redirect?: { code: 301 | 302; url: string };
  /** Location in effect after rewrites (changes when a `last` rewrite re-matches). */
  location: NginxLocation;
  iterations: number;
}

function expandCaptures(template: string, captures: string[]): string {
  return template.replace(/\$(\d)|\$\{(\d)\}/g, (_, a: string | undefined, b: string | undefined) => captures[Number(a ?? b)] ?? "");
}

export function applyRewrites(location: NginxLocation, uri: string, locations: NginxLocation[] = []): RewriteResult {
  const steps: RewriteStep[] = [];
  let current = location;
  let cur = uri;
  let iterations = 0;
  let everJumped = false;
  while (iterations < MAX_REWRITE_ITERATIONS) {
    iterations++;
    let changed = false;
    let jumped = false;
    for (const d of current.directives) {
      if (d.name !== "rewrite" || d.args.length < 2) continue;
      const [regex, replacement, flag = ""] = d.args;
      const compiled = pcreToJs(regex, false);
      if (!compiled.ok) {
        steps.push({ line: d.line, regex, replacement, flag, matched: false, from: cur, note: `regex not evaluated: ${compiled.error}` });
        continue;
      }
      const m = compiled.regex.exec(cur.slice(0, MAX_URI_LENGTH));
      if (!m) {
        steps.push({ line: d.line, regex, replacement, flag, matched: false, from: cur, note: "regex does not match; rewrite skipped" });
        continue;
      }
      const to = expandCaptures(replacement, Array.from(m));
      if (flag === "redirect" || flag === "permanent" || /^https?:\/\//.test(to)) {
        const code = flag === "permanent" ? 301 : 302;
        steps.push({ line: d.line, regex, replacement, flag, matched: true, from: cur, to, note: `${code} redirect to ${to}` });
        return { uri: to, steps, stopped: flag === "permanent" ? "permanent" : "redirect", redirect: { code, url: to }, location: current, iterations };
      }
      if (flag === "break") {
        steps.push({ line: d.line, regex, replacement, flag, matched: true, from: cur, to, note: "break: rewriting stops, request stays in this location" });
        return { uri: to, steps, stopped: "break", location: current, iterations };
      }
      cur = to;
      changed = true;
      if (flag === "last") {
        steps.push({ line: d.line, regex, replacement, flag, matched: true, from: m.input, to, note: "last: rewriting stops and location matching runs again with the new URI" });
        jumped = true;
        break;
      }
      steps.push({ line: d.line, regex, replacement, flag, matched: true, from: m.input, to, note: "no flag: continue with the next rewrite" });
    }
    if (!changed) return { uri: cur, steps, stopped: everJumped ? "last" : "none", location: current, iterations };
    if (!locations.length) return { uri: cur, steps, stopped: jumped ? "last" : "none", location: current, iterations };
    const next = matchLocation(locations, cur).matched;
    if (!next) return { uri: cur, steps, stopped: jumped ? "last" : "none", location: current, iterations };
    if (next === current) {
      if (!next.directives.some((d) => d.name === "rewrite")) return { uri: cur, steps, stopped: jumped ? "last" : "none", location: current, iterations };
      current = next;
      continue; // nginx re-runs the block; loop until the cap
    }
    current = next;
    everJumped = everJumped || jumped;
    if (!jumped) return { uri: cur, steps, stopped: "none", location: current, iterations };
  }
  return { uri: cur, steps, stopped: "loop", location: current, iterations };
}

/* ------------------------------ target resolution --------------------------- */

export type NginxTarget = { kind: "proxy"; target: string; note: string } | { kind: "file"; path: string; note: string } | { kind: "return"; code: number; url?: string; text?: string } | { kind: "none"; note: string };

function findDirective(dirs: NginxDirective[], name: string): NginxDirective | undefined {
  return dirs.find((d) => d.name === name);
}

export function resolveTarget(location: NginxLocation | null, uri: string, inherited: { root?: string; directives?: NginxDirective[] } = {}): NginxTarget {
  const dirs = location ? location.directives : (inherited.directives ?? []);
  const ret = findDirective(dirs, "return");
  if (ret && ret.args.length) {
    const code = Number(ret.args[0]);
    if (Number.isInteger(code)) {
      const rest = ret.args[1];
      let captures: string[] = [];
      if (location && (location.modifier === "~" || location.modifier === "~*")) {
        const c = pcreToJs(location.uri, location.modifier === "~*");
        if (c.ok) captures = Array.from(c.regex.exec(uri) ?? []);
      }
      const value = rest ? expandCaptures(rest, captures) : undefined;
      if (code >= 300 && code < 400 && value) return { kind: "return", code, url: value };
      return { kind: "return", code, text: value };
    }
    return { kind: "return", code: 302, url: ret.args[0] };
  }
  const proxy = findDirective(dirs, "proxy_pass");
  if (proxy && proxy.args[0]) {
    const target = proxy.args[0];
    if (target.includes("$")) return { kind: "proxy", target, note: "proxy_pass contains variables, so the URI is passed exactly as written in the directive (nginx does not append the request URI)." };
    const m = /^([a-z]+:\/\/[^/]+)(\/.*)?$/i.exec(target);
    if (!m) return { kind: "proxy", target: target + uri, note: "Could not parse the proxy_pass URL; request URI appended." };
    const base = m[1];
    const path = m[2];
    if (path === undefined) return { kind: "proxy", target: base + uri, note: "proxy_pass has no URI part, so the full request URI is passed unchanged." };
    if (!location || location.modifier === "~" || location.modifier === "~*") {
      return { kind: "proxy", target: base + path, note: "proxy_pass with a URI part inside a regex location is a configuration error unless a rewrite with break sets the URI; nginx would refuse to start." };
    }
    const rest = uri.startsWith(location.uri) ? uri.slice(location.uri.length) : uri;
    return { kind: "proxy", target: base + path + rest, note: `proxy_pass has a URI part: the location prefix “${location.uri}” is replaced by “${path}”.` };
  }
  const alias = findDirective(dirs, "alias");
  const tryFiles = findDirective(dirs, "try_files");
  const tryNote = tryFiles ? ` try_files then checks ${tryFiles.args.map((a) => `“${a.replace(/\$uri/g, uri)}”`).join(", ")} in order.` : "";
  if (alias && alias.args[0] && location) {
    if (location.modifier === "~" || location.modifier === "~*") {
      const c = pcreToJs(location.uri, location.modifier === "~*");
      const captures = c.ok ? Array.from(c.regex.exec(uri) ?? []) : [];
      return { kind: "file", path: expandCaptures(alias.args[0], captures), note: `alias in a regex location: captures are substituted into the alias path.${tryNote}` };
    }
    const rest = uri.startsWith(location.uri) ? uri.slice(location.uri.length) : uri;
    return { kind: "file", path: alias.args[0] + rest, note: `alias replaces the location prefix “${location.uri}” with “${alias.args[0]}”.${tryNote}` };
  }
  const root = findDirective(dirs, "root")?.args[0] ?? inherited.root;
  if (root) {
    const own = !!findDirective(dirs, "root");
    return { kind: "file", path: root.replace(/\/$/, "") + uri, note: `root ${own ? "set in this location" : "inherited from the server block"}: the full URI is appended to “${root}”.${tryNote}` };
  }
  return { kind: "none", note: `No proxy_pass, root, alias or return here; nginx uses its compiled-in default root (usually <prefix>/html).${tryNote}` };
}

/* ---------------------------------- simulate -------------------------------- */

export interface NginxSimulation {
  /** URI after query-string removal, percent-decoding and slash merging. */
  uri: string;
  serverRewrites: RewriteStep[];
  match: LocationMatch;
  rewrites: RewriteResult | null;
  finalUri: string;
  target: NginxTarget;
}

export function normalizeUri(raw: string): string {
  let u = raw.trim().slice(0, MAX_URI_LENGTH);
  if (!u) return "/";
  if (/^https?:\/\//i.test(u)) u = u.replace(/^https?:\/\/[^/]*/i, "") || "/";
  const q = u.search(/[?#]/);
  if (q >= 0) u = u.slice(0, q);
  try {
    u = decodeURIComponent(u);
  } catch {
    // keep the raw form when the encoding is malformed
  }
  if (!u.startsWith("/")) u = `/${u}`;
  u = u.replace(/\/{2,}/g, "/");
  const parts: string[] = [];
  for (const seg of u.split("/")) {
    if (seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const joined = parts.join("/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

export function simulateRequest(config: NginxConfig, rawUri: string): NginxSimulation {
  const uri = normalizeUri(rawUri);
  const serverRoot = findDirective(config.serverDirectives, "root")?.args[0];
  // Server-level rewrites run before location matching.
  const serverPseudo: NginxLocation = { modifier: "", uri: "", line: 0, directives: config.serverDirectives.filter((d) => d.name === "rewrite"), children: [], order: -1 };
  const server = applyRewrites(serverPseudo, uri);
  if (server.redirect) {
    const match: LocationMatch = { matched: null, steps: ["A server-level rewrite redirected the request before any location was considered."], candidates: [], captures: [] };
    return { uri, serverRewrites: server.steps, match, rewrites: null, finalUri: server.uri, target: { kind: "return", code: server.redirect.code, url: server.redirect.url } };
  }
  const afterServer = server.uri;
  const match = matchLocation(config.locations, afterServer);
  if (!match.matched) return { uri, serverRewrites: server.steps, match, rewrites: null, finalUri: afterServer, target: resolveTarget(null, afterServer, { root: serverRoot, directives: config.serverDirectives }) };
  const rewrites = applyRewrites(match.matched, afterServer, config.locations);
  if (rewrites.redirect) return { uri, serverRewrites: server.steps, match, rewrites, finalUri: rewrites.uri, target: { kind: "return", code: rewrites.redirect.code, url: rewrites.redirect.url } };
  return { uri, serverRewrites: server.steps, match, rewrites, finalUri: rewrites.uri, target: resolveTarget(rewrites.location, rewrites.uri, { root: serverRoot }) };
}

export const NGINX_SAMPLE = `server {
    listen 80;
    server_name example.com;
    root /var/www/html;

    # Exact match: only /login, nothing else
    location = /login {
        proxy_pass http://auth:9000;
    }

    # ^~ prefix: wins over regexes for anything under /static/
    location ^~ /static/ {
        alias /srv/assets/;
        expires 30d;
    }

    # Case-insensitive regex: images anywhere else
    location ~* \\.(png|jpe?g|gif|svg|webp)$ {
        root /srv/media;
    }

    # Case-sensitive regex: versioned API
    location ~ ^/api/v[0-9]+/ {
        proxy_pass http://api:8080;
    }

    # Prefix with URI replacement: /docs/intro -> http://docs:3000/intro
    location /docs/ {
        proxy_pass http://docs:3000/;
    }

    # Rewrite with a flag
    location /old/ {
        rewrite ^/old/(.*)$ /new/$1 last;
    }

    location /new/ {
        try_files $uri $uri/ /index.html;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
`;

export const NGINX_EXAMPLE_URIS = ["/login", "/static/logo.png", "/images/logo.png", "/api/v1/users", "/docs/intro", "/old/page", "/about"];
