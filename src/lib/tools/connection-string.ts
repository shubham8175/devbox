/**
 * Parse and build database connection URIs entirely in the browser. Passwords
 * are kept in memory only for the current render; nothing is stored or sent.
 */

export type ConnectionKind = "postgres" | "mysql" | "mongodb" | "redis" | "amqp" | "other";

export interface ConnectionHost {
  host: string;
  port: number | null;
  /** True when the port was omitted or equals the driver default */
  defaultPort: boolean;
}

export interface ParsedConnection {
  ok: true;
  scheme: string;
  kind: ConnectionKind;
  username: string;
  /** Percent-decoded password, exactly as the driver would see it */
  password: string;
  passwordMasked: string;
  hosts: ConnectionHost[];
  database: string;
  params: Record<string, string>;
  /** Original URI with the password replaced by **** */
  masked: string;
  warnings: string[];
  /** Notes about normalisation performed (jdbc: prefix, key=value form…) */
  notes: string[];
}

export interface ConnectionError {
  ok: false;
  error: string;
}

export const CONNECTION_LIMITS = { maxChars: 4_000 } as const;

export const DEFAULT_PORTS: Record<ConnectionKind, number | null> = {
  postgres: 5432,
  mysql: 3306,
  mongodb: 27017,
  redis: 6379,
  amqp: 5672,
  other: null,
};

/** Query parameter (or scheme) that turns on TLS for each kind. */
export const SSL_PARAMS: Record<ConnectionKind, { param: string; value: string } | { scheme: string } | null> = {
  postgres: { param: "sslmode", value: "require" },
  mysql: { param: "ssl-mode", value: "REQUIRED" },
  mongodb: { param: "tls", value: "true" },
  redis: { scheme: "rediss" },
  amqp: { scheme: "amqps" },
  other: null,
};

export const CONNECTION_KINDS: Array<{ id: Exclude<ConnectionKind, "other">; label: string; scheme: string; schemes: string[] }> = [
  { id: "postgres", label: "PostgreSQL", scheme: "postgresql", schemes: ["postgresql", "postgres"] },
  { id: "mysql", label: "MySQL / MariaDB", scheme: "mysql", schemes: ["mysql", "mariadb"] },
  { id: "mongodb", label: "MongoDB", scheme: "mongodb", schemes: ["mongodb", "mongodb+srv"] },
  { id: "redis", label: "Redis", scheme: "redis", schemes: ["redis", "rediss"] },
  { id: "amqp", label: "AMQP (RabbitMQ)", scheme: "amqp", schemes: ["amqp", "amqps"] },
];

export const MASK = "••••••";

function kindOf(scheme: string): ConnectionKind {
  const s = scheme.toLowerCase();
  if (s === "postgres" || s === "postgresql" || s === "pgsql") return "postgres";
  if (s === "mysql" || s === "mysql2" || s === "mariadb") return "mysql";
  if (s === "mongodb" || s === "mongodb+srv") return "mongodb";
  if (s === "redis" || s === "rediss") return "redis";
  if (s === "amqp" || s === "amqps") return "amqp";
  return "other";
}

/** Decode %XX sequences; returns the raw text (and a flag) when the encoding is malformed. */
function safeDecode(s: string): { value: string; malformed: boolean } {
  try {
    return { value: decodeURIComponent(s), malformed: false };
  } catch {
    return { value: s, malformed: true };
  }
}

function parseParams(query: string): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  if (!query) return out;
  for (const pair of query.split(/[&;]/)) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = safeDecode(eq < 0 ? pair : pair.slice(0, eq)).value;
    const v = safeDecode(eq < 0 ? "" : pair.slice(eq + 1)).value;
    // Never let user keys reach Object.prototype.
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k] = v;
  }
  return out;
}

function parseHost(spec: string, kind: ConnectionKind): ConnectionHost {
  let host = spec;
  let port: number | null = null;
  const v6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(spec);
  if (v6) {
    host = v6[1];
    port = v6[2] ? Number(v6[2]) : null;
  } else {
    const i = spec.lastIndexOf(":");
    if (i > 0 && /^\d+$/.test(spec.slice(i + 1))) {
      host = spec.slice(0, i);
      port = Number(spec.slice(i + 1));
    }
  }
  const def = DEFAULT_PORTS[kind];
  return { host: safeDecode(host).value, port, defaultPort: port === null || port === def };
}

function isLocal(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local") || host.startsWith("/");
}

/** Postgres key=value DSN: host=localhost port=5432 user=app dbname=db */
function parseKeyValueDsn(raw: string): ParsedConnection | ConnectionError {
  const params: Record<string, string> = Object.create(null);
  const re = /(\w+)\s*=\s*('((?:[^'\\]|\\.)*)'|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const key = m[1].toLowerCase();
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    params[key] = m[3] !== undefined ? m[3].replace(/\\(.)/g, "$1") : m[2];
  }
  const kind: ConnectionKind = "postgres";
  const hosts = (params.host ?? "localhost").split(",").map((h, i) => {
    const port = (params.port ?? "").split(",")[i] ?? (params.port ?? "").split(",")[0];
    return parseHost(port ? `${h}:${port}` : h, kind);
  });
  const { host: _h, port: _p, user, password, dbname, ...rest } = params;
  void _h;
  void _p;
  const uri = buildConnectionString({ kind, username: user ?? "", password: password ?? "", hosts: hosts.map((h) => ({ host: h.host, port: h.port })), database: dbname ?? "", params: rest });
  const parsed = parseConnectionString(uri);
  if (!parsed.ok) return parsed;
  return { ...parsed, notes: ["Converted from key=value DSN form to a URI.", ...parsed.notes] };
}

/** Parse a connection URI without `new URL()`, so multi-host MongoDB and odd passwords work. */
export function parseConnectionString(input: string): ParsedConnection | ConnectionError {
  let raw = input.trim();
  if (!raw) return { ok: false, error: "Paste a connection string to inspect it." };
  if (raw.length > CONNECTION_LIMITS.maxChars) return { ok: false, error: `That is longer than ${CONNECTION_LIMITS.maxChars} characters; connection strings are much shorter.` };
  const notes: string[] = [];
  const warnings: string[] = [];
  // Strip surrounding quotes and an env-var prefix such as DATABASE_URL=
  const env = /^(?:export\s+)?[A-Z_][A-Z0-9_]*\s*=\s*([\s\S]+)$/.exec(raw);
  if (env && !/^\w+=\S+\s+\w+=/.test(raw)) raw = env[1].trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
  if (/^jdbc:/i.test(raw)) {
    raw = raw.slice(5);
    notes.push("Removed the jdbc: prefix; the rest is a normal URI.");
  }
  if (!raw.includes("://")) {
    if (/\b(host|dbname|user|password|port)\s*=/.test(raw)) return parseKeyValueDsn(raw);
    return { ok: false, error: "Expected scheme://user:password@host:port/database. No scheme separator (://) found." };
  }
  const schemeEnd = raw.indexOf("://");
  const scheme = raw.slice(0, schemeEnd);
  if (!/^[A-Za-z][A-Za-z0-9+.-]*$/.test(scheme)) return { ok: false, error: `"${scheme}" is not a valid URI scheme.` };
  const kind = kindOf(scheme);
  const rest = raw.slice(schemeEnd + 3);

  // Query starts at the first "?"; the userinfo ends at the LAST "@" before it, so passwords with "@" or "/" still parse.
  const qIndex = rest.indexOf("?");
  const beforeQuery = qIndex < 0 ? rest : rest.slice(0, qIndex);
  const query = qIndex < 0 ? "" : rest.slice(qIndex + 1).replace(/#.*$/, "");
  const at = beforeQuery.lastIndexOf("@");
  const userinfo = at < 0 ? "" : beforeQuery.slice(0, at);
  const hostPath = at < 0 ? beforeQuery : beforeQuery.slice(at + 1);
  const slash = hostPath.indexOf("/");
  const hostPart = slash < 0 ? hostPath : hostPath.slice(0, slash);
  const path = slash < 0 ? "" : hostPath.slice(slash + 1);

  let username = "";
  let password = "";
  let hasPassword = false;
  let rawPassword = "";
  if (userinfo) {
    const colon = userinfo.indexOf(":");
    const u = colon < 0 ? userinfo : userinfo.slice(0, colon);
    rawPassword = colon < 0 ? "" : userinfo.slice(colon + 1);
    hasPassword = colon >= 0;
    const du = safeDecode(u);
    const dp = safeDecode(rawPassword);
    username = du.value;
    password = dp.value;
    if (du.malformed || dp.malformed) warnings.push("The username or password contains a stray % that is not valid percent-encoding; it was kept as-is.");
    if (/[@/:?#]/.test(rawPassword)) warnings.push(`The password contains reserved characters (${[...new Set(rawPassword.match(/[@/:?#]/g))].join(" ")}) that are not percent-encoded. Many drivers will misparse this; encode it (for example @ → %40).`);
  }

  const hosts = hostPart
    .split(",")
    .filter(Boolean)
    .map((h) => parseHost(h, kind));
  if (!hosts.length && kind !== "other") return { ok: false, error: "No host found after the scheme." };
  const database = safeDecode(path.replace(/#.*$/, "")).value;
  const params = parseParams(query);

  const masked = hasPassword ? `${scheme}://${userinfo.slice(0, userinfo.indexOf(":") + 1)}****@${hostPath}${qIndex < 0 ? "" : rest.slice(qIndex)}` : raw;

  // ---- warnings
  const pk = (name: string) => Object.keys(params).find((k) => k.toLowerCase() === name.toLowerCase());
  const anyLocal = hosts.some((h) => isLocal(h.host));
  if (hasPassword && password) warnings.push("The password is embedded in the URI. Keep it in an environment variable or secrets manager, never in source control.");
  if (userinfo && !hasPassword && kind !== "redis") warnings.push("A username is given without a password.");
  if (!anyLocal && hosts.length) {
    const s = scheme.toLowerCase();
    if (kind === "postgres") {
      const mode = params[pk("sslmode") ?? ""];
      if (!mode || mode === "disable" || mode === "allow" || mode === "prefer") warnings.push(`No sslmode=require (or stronger) parameter${mode ? ` (currently ${mode})` : ""}: the connection may be unencrypted.`);
    } else if (kind === "mysql") {
      if (!pk("ssl") && !pk("ssl-mode") && !pk("sslmode") && !pk("tls") && !pk("sslaccept")) warnings.push("No SSL parameter (ssl-mode=REQUIRED or ssl=true): the connection may be unencrypted.");
    } else if (kind === "mongodb" && s !== "mongodb+srv") {
      const tls = params[pk("tls") ?? pk("ssl") ?? ""];
      if (tls !== "true") warnings.push("No tls=true parameter: the connection may be unencrypted (mongodb+srv enables TLS by default).");
    } else if (kind === "redis" && s === "redis") warnings.push("redis:// is plaintext; use rediss:// for TLS.");
    else if (kind === "amqp" && s === "amqp") warnings.push("amqp:// is plaintext; use amqps:// for TLS.");
  }
  if (anyLocal) warnings.push("Points at localhost — fine for development, but this will not work from another machine or container.");
  for (const h of hosts) if (h.port === null && DEFAULT_PORTS[kind] !== null) warnings.push(`No port for ${h.host}; the driver default ${DEFAULT_PORTS[kind]} is assumed.`);
  if (scheme.toLowerCase() === "mongodb+srv") {
    if (hosts.length > 1) warnings.push("mongodb+srv takes a single DNS name; multiple hosts are not allowed.");
    if (hosts.some((h) => h.port !== null)) warnings.push("mongodb+srv does not accept a port; it is resolved from DNS SRV records.");
  }
  if (kind === "mongodb" && hosts.length > 1 && !pk("replicaSet")) warnings.push("Several hosts but no replicaSet parameter; the driver will treat them as seeds and discover the set, which is fine, but naming it fails faster on misconfiguration.");
  if (!database && (kind === "postgres" || kind === "mysql")) warnings.push("No database name in the path; the driver will use its default (often the username).");
  if (kind === "redis" && database && !/^\d+$/.test(database)) warnings.push("Redis paths select a numeric database index (redis://host/0).");

  return { ok: true, scheme, kind, username, password, passwordMasked: hasPassword ? MASK : "", hosts, database, params, masked, warnings, notes };
}

export interface BuildInput {
  kind: ConnectionKind;
  /** Explicit scheme, otherwise the kind's default (postgresql, mysql, mongodb, redis, amqp) */
  scheme?: string;
  username: string;
  password: string;
  hosts: Array<{ host: string; port: number | null }>;
  database: string;
  params: Record<string, string>;
}

/** Percent-encode everything a URI userinfo, path segment or query value can't contain literally. */
export function encodePart(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function buildConnectionString(input: BuildInput): string {
  const scheme = input.scheme?.trim() || CONNECTION_KINDS.find((k) => k.id === input.kind)?.scheme || "db";
  const hosts = input.hosts
    .filter((h) => h.host.trim())
    .map((h) => {
      const host = h.host.trim();
      const shown = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
      return h.port ? `${shown}:${h.port}` : shown;
    })
    .join(",");
  let auth = "";
  if (input.username || input.password) {
    auth = encodePart(input.username);
    if (input.password) auth += `:${encodePart(input.password)}`;
    auth += "@";
  }
  const db = input.database.trim();
  const path = db ? `/${db.split("/").map(encodePart).join("/")}` : "";
  const query = Object.entries(input.params)
    .filter(([k]) => k.trim())
    .map(([k, v]) => `${encodePart(k.trim())}=${encodePart(v)}`)
    .join("&");
  return `${scheme}://${auth}${hosts}${path || (query ? "/" : "")}${query ? `?${query}` : ""}`;
}

/** A .env line; values are double-quoted so `#`, spaces and `$` survive dotenv parsing. */
export function toEnvLine(name: string, uri: string): string {
  const key = name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_") || "DATABASE_URL";
  return `${key}="${uri.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;
}

export const CONNECTION_SAMPLE = "postgresql://app_user:s3cr3t%40pass@db.example.com:5432/app?sslmode=require&application_name=devbox";
