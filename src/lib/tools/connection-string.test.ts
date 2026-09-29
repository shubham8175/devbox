import { describe, expect, it } from "vitest";
import { CONNECTION_LIMITS, CONNECTION_SAMPLE, buildConnectionString, encodePart, parseConnectionString, toEnvLine, type ParsedConnection } from "@/lib/tools/connection-string";

function ok(raw: string): ParsedConnection {
  const r = parseConnectionString(raw);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("parseConnectionString", () => {
  it("parses the sample Postgres URI with a percent-encoded password", () => {
    const r = ok(CONNECTION_SAMPLE);
    expect(r).toMatchObject({ scheme: "postgresql", kind: "postgres", username: "app_user", password: "s3cr3t@pass", passwordMasked: "••••••", database: "app" });
    expect(r.hosts).toEqual([{ host: "db.example.com", port: 5432, defaultPort: true }]);
    expect(r.params).toEqual({ sslmode: "require", application_name: "devbox" });
    expect(r.masked).toBe("postgresql://app_user:****@db.example.com:5432/app?sslmode=require&application_name=devbox");
    expect(r.warnings).toEqual(["The password is embedded in the URI. Keep it in an environment variable or secrets manager, never in source control."]);
  });

  it("keeps passwords containing @ : / literally and warns that they need encoding", () => {
    const r = ok("mysql://root:p@ss:w/rd@10.0.0.5:3307/shop");
    expect(r.username).toBe("root");
    expect(r.password).toBe("p@ss:w/rd");
    expect(r.hosts).toEqual([{ host: "10.0.0.5", port: 3307, defaultPort: false }]);
    expect(r.database).toBe("shop");
    expect(r.masked).toBe("mysql://root:****@10.0.0.5:3307/shop");
    expect(r.warnings.some((w) => /reserved characters \(@ : \/\)/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /No SSL parameter/.test(w))).toBe(true);
  });

  it("parses multi-host MongoDB with replica set, auth database and options", () => {
    const r = ok("mongodb://admin:pa%3A%40ss@mongo1.internal:27017,mongo2.internal:27018,mongo3.internal/prod?replicaSet=rs0&authSource=admin&tls=true");
    expect(r.kind).toBe("mongodb");
    expect(r.password).toBe("pa:@ss");
    expect(r.hosts).toEqual([
      { host: "mongo1.internal", port: 27017, defaultPort: true },
      { host: "mongo2.internal", port: 27018, defaultPort: false },
      { host: "mongo3.internal", port: null, defaultPort: true },
    ]);
    expect(r.database).toBe("prod");
    expect(r.params).toEqual({ replicaSet: "rs0", authSource: "admin", tls: "true" });
    expect(r.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/No port for mongo3.internal/)]));
    expect(r.warnings.some((w) => /tls=true/.test(w))).toBe(false);
  });

  it("understands mongodb+srv, redis db index and AMQP vhosts", () => {
    const srv = ok("mongodb+srv://u:p@cluster0.abcde.mongodb.net/app?retryWrites=true&w=majority");
    expect(srv.scheme).toBe("mongodb+srv");
    expect(srv.hosts).toEqual([{ host: "cluster0.abcde.mongodb.net", port: null, defaultPort: true }]);
    expect(srv.warnings.some((w) => /unencrypted/.test(w))).toBe(false);

    const redis = ok("redis://:secret@cache.example.com:6379/2");
    expect(redis).toMatchObject({ kind: "redis", username: "", password: "secret", database: "2" });
    expect(redis.warnings.some((w) => /rediss:\/\//.test(w))).toBe(true);
    expect(ok("rediss://cache.example.com").warnings.some((w) => /plaintext/.test(w))).toBe(false);

    const amqp = ok("amqps://guest:guest@rabbit.example.com/%2Fvhost");
    expect(amqp).toMatchObject({ kind: "amqp", database: "/vhost" });
    expect(amqp.hosts[0].port).toBeNull();
  });

  it("handles IPv6 hosts, localhost, quotes and env-style prefixes", () => {
    const v6 = ok("postgres://u@[::1]:5433/db");
    expect(v6.hosts).toEqual([{ host: "::1", port: 5433, defaultPort: false }]);
    expect(v6.warnings.some((w) => /localhost/.test(w))).toBe(true);
    expect(v6.warnings.some((w) => /sslmode/.test(w))).toBe(false);
    expect(v6.warnings.some((w) => /without a password/.test(w))).toBe(true);
    const env = ok('DATABASE_URL="postgres://u:p@localhost/db"');
    expect(env.database).toBe("db");
    expect(env.masked).toBe("postgres://u:****@localhost/db");
  });

  it("strips a jdbc: prefix with a note", () => {
    const r = ok("jdbc:postgresql://db.internal:5432/app?sslmode=disable");
    expect(r.notes).toEqual(["Removed the jdbc: prefix; the rest is a normal URI."]);
    expect(r.scheme).toBe("postgresql");
    expect(r.warnings.some((w) => /currently disable/.test(w))).toBe(true);
  });

  it("accepts the Postgres key=value DSN form", () => {
    const r = ok("host=db.internal port=5432 user=app password='p a@ss' dbname=app sslmode=require");
    expect(r.kind).toBe("postgres");
    expect(r.username).toBe("app");
    expect(r.password).toBe("p a@ss");
    expect(r.database).toBe("app");
    expect(r.params).toEqual({ sslmode: "require" });
    expect(r.notes[0]).toMatch(/key=value/);
    expect(r.masked).toBe("postgresql://app:****@db.internal:5432/app?sslmode=require");
  });

  it("tolerates a malformed percent sequence and warns", () => {
    const r = ok("postgres://u:100%pass@h/db");
    expect(r.password).toBe("100%pass");
    expect(r.warnings.some((w) => /stray %/.test(w))).toBe(true);
  });

  it("returns errors for empty, scheme-less and oversized input", () => {
    expect(parseConnectionString("")).toMatchObject({ ok: false });
    expect(parseConnectionString("just some text")).toMatchObject({ ok: false, error: expect.stringMatching(/scheme/) });
    expect(parseConnectionString("1bad://x")).toMatchObject({ ok: false });
    expect(parseConnectionString("postgres://" + "a".repeat(CONNECTION_LIMITS.maxChars))).toMatchObject({ ok: false });
  });

  it("ignores prototype-polluting parameter names", () => {
    const r = ok("postgres://h/db?__proto__=x&constructor=y&ok=1");
    expect(r.params).toEqual({ ok: "1" });
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe("buildConnectionString", () => {
  it("percent-encodes reserved characters in the password and round-trips", () => {
    const uri = buildConnectionString({ kind: "postgres", username: "app user", password: "p@ss:w/rd?#%", hosts: [{ host: "db", port: 5432 }], database: "app", params: { sslmode: "require" } });
    expect(uri).toBe("postgresql://app%20user:p%40ss%3Aw%2Frd%3F%23%25@db:5432/app?sslmode=require");
    const back = ok(uri);
    expect(back.username).toBe("app user");
    expect(back.password).toBe("p@ss:w/rd?#%");
    expect(back.warnings.some((w) => /reserved characters/.test(w))).toBe(false);
  });

  it("supports multiple hosts, IPv6, no auth and custom schemes", () => {
    expect(buildConnectionString({ kind: "mongodb", scheme: "mongodb+srv", username: "u", password: "", hosts: [{ host: "c.mongodb.net", port: null }], database: "", params: { retryWrites: "true" } })).toBe("mongodb+srv://u@c.mongodb.net/?retryWrites=true");
    expect(buildConnectionString({ kind: "mongodb", username: "", password: "", hosts: [{ host: "a", port: 27017 }, { host: "::1", port: 27018 }, { host: " ", port: 1 }], database: "db", params: {} })).toBe("mongodb://a:27017,[::1]:27018/db");
    expect(buildConnectionString({ kind: "redis", username: "", password: "s", hosts: [{ host: "r", port: null }], database: "0", params: {} })).toBe("redis://:s@r/0");
  });

  it("encodes characters that encodeURIComponent leaves alone", () => {
    expect(encodePart("a!b'c(d)e*f")).toBe("a%21b%27c%28d%29e%2Af");
  });
});

describe("toEnvLine", () => {
  it("quotes and escapes for dotenv", () => {
    expect(toEnvLine("database url", 'postgres://u:p"$@h/db')).toBe('DATABASE_URL="postgres://u:p\\"\\$@h/db"');
    expect(toEnvLine("", "x")).toBe('DATABASE_URL="x"');
  });
});
