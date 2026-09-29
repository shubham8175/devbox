import { describe, expect, it } from "vitest";
import { NGINX_EXAMPLE_URIS, NGINX_SAMPLE, applyRewrites, matchLocation, normalizeUri, parseNginxConfig, pcreToJs, resolveTarget, simulateRequest, type NginxConfig, type NginxLocation } from "@/lib/tools/nginx";

function cfg(text: string): NginxConfig {
  const r = parseNginxConfig(text);
  if (!r.ok) throw new Error(r.error);
  return r;
}
const loc = (modifier: NginxLocation["modifier"], uri: string, order = 0, directives: NginxLocation["directives"] = []): NginxLocation => ({ modifier, uri, line: order + 1, directives, children: [], order });
const sample = cfg(NGINX_SAMPLE);

describe("parseNginxConfig", () => {
  it("parses the sample into ordered locations with modifiers", () => {
    expect(sample.servers).toBe(1);
    expect(sample.warnings).toEqual([]);
    expect(sample.locations.map((l) => [l.modifier, l.uri])).toEqual([
      ["=", "/login"],
      ["^~", "/static/"],
      ["~*", "\\.(png|jpe?g|gif|svg|webp)$"],
      ["~", "^/api/v[0-9]+/"],
      ["", "/docs/"],
      ["", "/old/"],
      ["", "/new/"],
      ["", "/"],
    ]);
    expect(sample.locations.map((l) => l.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(sample.serverDirectives.map((d) => d.name)).toEqual(["listen", "server_name", "root"]);
  });

  it("handles quotes, comments, escaped characters and nested locations", () => {
    const c = cfg('location ~ "^/u/\\d{3}$" { # comment ; { }\n  return 200 "ok; fine";\n  location /nested/ { root /x; }\n}');
    expect(c.locations[0].uri).toBe("^/u/\\d{3}$");
    expect(c.locations[0].directives[0].args).toEqual(["200", "ok; fine"]);
    expect(c.locations[0].children[0].uri).toBe("/nested/");
  });

  it("finds locations inside http { server { } } and warns about several servers", () => {
    const c = cfg("http { server { location /a { } } server { location /b { } } }");
    expect(c.locations.map((l) => l.uri)).toEqual(["/a"]);
    expect(c.warnings[0]).toMatch(/2 server blocks/);
  });

  it("is tolerant of unterminated blocks and stray braces", () => {
    const c = cfg("server {\n location / { root /x; \n");
    expect(c.locations[0].uri).toBe("/");
    expect(c.warnings.join(" ")).toMatch(/never closed/);
    expect(cfg("} location / { }").warnings[0]).toMatch(/unexpected/);
    expect(cfg("location / { root /x }").warnings.join(" ")).toMatch(/missing/);
    expect(cfg("location = /x { location /y { } }").warnings.join(" ")).toMatch(/exact/);
  });

  it("rejects empty and oversized input", () => {
    expect(parseNginxConfig("  ")).toMatchObject({ ok: false });
    expect(parseNginxConfig("x".repeat(200_001))).toMatchObject({ ok: false });
    expect(cfg("listen 80;").warnings[0]).toMatch(/No location blocks/);
  });
});

describe("pcreToJs", () => {
  it("converts PCRE-only syntax with notes", () => {
    const r = pcreToJs("(?i)^/A(?P<id>\\d+)[[:alpha:]]+(?>x)y++\\Z", false);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.regex.flags).toBe("i");
      expect(r.regex.test("/a12abcxyyy")).toBe(true);
      expect(r.notes.join(" ")).toMatch(/Atomic[\s\S]*Possessive/);
    }
    expect(pcreToJs("\\++", false)).toMatchObject({ ok: true });
  });

  it("reports invalid or oversized regexes", () => {
    expect(pcreToJs("(", false)).toMatchObject({ ok: false });
    expect(pcreToJs("a".repeat(501), false)).toMatchObject({ ok: false });
  });
});

describe("matchLocation precedence", () => {
  const locations = [loc("", "/", 0), loc("", "/images/", 1), loc("^~", "/static/", 2), loc("~*", "\\.png$", 3), loc("~", "^/images/hi", 4), loc("=", "/images/", 5)];

  it("exact beats everything", () => {
    const m = matchLocation(locations, "/images/");
    expect(m.matched?.modifier).toBe("=");
    expect(m.steps[0]).toMatch(/Exact location/);
  });

  it("^~ longest prefix stops regex search", () => {
    const m = matchLocation(locations, "/static/a.png");
    expect(m.matched?.modifier).toBe("^~");
    expect(m.steps.join(" ")).toMatch(/regular-expression locations are skipped/);
  });

  it("regexes are tried in order of appearance, and the first wins", () => {
    const m = matchLocation(locations, "/images/hi.PNG");
    expect(m.matched?.uri).toBe("\\.png$");
    expect(m.captures[0]).toBe(".PNG");
    expect(matchLocation(locations, "/images/hi").matched?.uri).toBe("^/images/hi");
  });

  it("falls back to the longest prefix when no regex matches", () => {
    const m = matchLocation(locations, "/images/photo.jpg");
    expect(m.matched?.uri).toBe("/images/");
    expect(m.steps.at(-1)).toMatch(/No regex matched; using the longest prefix/);
    expect(matchLocation(locations, "/about").matched?.uri).toBe("/");
    expect(matchLocation([loc("=", "/x")], "/y").matched).toBeNull();
  });

  it("searches nested locations and skips uncompilable regexes", () => {
    const parent = loc("", "/app/", 0);
    parent.children = [loc("~", "\\.php$", 1)];
    const m = matchLocation([parent, loc("~", "(", 2)], "/app/index.php");
    expect(m.matched?.uri).toBe("\\.php$");
    expect(m.candidates.find((c) => c.location.uri === "(")?.note).toMatch(/not evaluated/);
  });
});

describe("resolveTarget", () => {
  it("proxy_pass without a URI part passes the whole URI", () => {
    const t = resolveTarget(loc("", "/api/", 0, [{ name: "proxy_pass", args: ["http://backend:8080"], line: 1 }]), "/api/users?x=1");
    expect(t).toMatchObject({ kind: "proxy", target: "http://backend:8080/api/users?x=1" });
  });

  it("proxy_pass with a URI part replaces the location prefix", () => {
    const t = resolveTarget(loc("", "/api/", 0, [{ name: "proxy_pass", args: ["http://backend/v2/"], line: 1 }]), "/api/users");
    expect(t).toMatchObject({ kind: "proxy", target: "http://backend/v2/users" });
    const slashless = resolveTarget(loc("", "/api", 0, [{ name: "proxy_pass", args: ["http://backend/"], line: 1 }]), "/api/users");
    expect(slashless).toMatchObject({ target: "http://backend//users" });
    const regex = resolveTarget(loc("~", "^/api", 0, [{ name: "proxy_pass", args: ["http://backend/x"], line: 1 }]), "/api/users");
    expect(regex.kind === "proxy" && regex.note).toMatch(/configuration error/);
  });

  it("alias replaces the prefix while root appends the full URI", () => {
    const a = resolveTarget(loc("", "/static/", 0, [{ name: "alias", args: ["/srv/assets/"], line: 1 }]), "/static/app.js");
    expect(a).toMatchObject({ kind: "file", path: "/srv/assets/app.js" });
    const r = resolveTarget(loc("", "/static/", 0, [{ name: "root", args: ["/srv/assets/"], line: 1 }]), "/static/app.js");
    expect(r).toMatchObject({ kind: "file", path: "/srv/assets/static/app.js" });
    const inherited = resolveTarget(loc("", "/", 0, [{ name: "try_files", args: ["$uri", "$uri/", "/index.html"], line: 1 }]), "/a", { root: "/var/www" });
    expect(inherited).toMatchObject({ kind: "file", path: "/var/www/a" });
    expect(inherited.kind === "file" && inherited.note).toMatch(/inherited.*try_files then checks “\/a”, “\/a\/”, “\/index.html”/);
    const regexAlias = resolveTarget(loc("~", "^/img/(.+)$", 0, [{ name: "alias", args: ["/data/$1"], line: 1 }]), "/img/a.png");
    expect(regexAlias).toMatchObject({ kind: "file", path: "/data/a.png" });
    expect(resolveTarget(loc("", "/", 0), "/a").kind).toBe("none");
  });

  it("return takes priority and expands captures", () => {
    expect(resolveTarget(loc("", "/", 0, [{ name: "return", args: ["301", "https://x.io$request_uri"], line: 1 }, { name: "proxy_pass", args: ["http://b"], line: 2 }]), "/a")).toEqual({ kind: "return", code: 301, url: "https://x.io$request_uri" });
    expect(resolveTarget(loc("~", "^/go/(\\w+)", 0, [{ name: "return", args: ["302", "https://$1.example.com"], line: 1 }]), "/go/docs")).toEqual({ kind: "return", code: 302, url: "https://docs.example.com" });
    expect(resolveTarget(loc("", "/", 0, [{ name: "return", args: ["404"], line: 1 }]), "/a")).toEqual({ kind: "return", code: 404, text: undefined });
  });
});

describe("applyRewrites", () => {
  const locations = [loc("", "/old/", 0, [{ name: "rewrite", args: ["^/old/(.*)$", "/new/$1", "last"], line: 2 }]), loc("", "/new/", 1), loc("", "/loop/", 2, [{ name: "rewrite", args: ["^/loop/(.*)$", "/loop/x$1", "last"], line: 3 }])];

  it("last re-runs location matching once", () => {
    const r = applyRewrites(locations[0], "/old/page", locations);
    expect(r.uri).toBe("/new/page");
    expect(r.location.uri).toBe("/new/");
    expect(r.stopped).toBe("last");
    expect(r.steps[0]).toMatchObject({ matched: true, from: "/old/page", to: "/new/page", flag: "last" });
  });

  it("break stops in the same location; redirect and permanent produce redirects", () => {
    const brk = applyRewrites(loc("", "/a/", 0, [{ name: "rewrite", args: ["^/a/(.*)", "/b/$1", "break"], line: 1 }, { name: "rewrite", args: ["^", "/never"], line: 2 }]), "/a/x", locations);
    expect(brk).toMatchObject({ uri: "/b/x", stopped: "break" });
    expect(brk.steps).toHaveLength(1);
    expect(applyRewrites(loc("", "/", 0, [{ name: "rewrite", args: ["^/(.*)$", "https://x.io/$1", "permanent"], line: 1 }]), "/p")).toMatchObject({ stopped: "permanent", redirect: { code: 301, url: "https://x.io/p" } });
    expect(applyRewrites(loc("", "/", 0, [{ name: "rewrite", args: ["^/(.*)$", "/r/$1", "redirect"], line: 1 }]), "/p")).toMatchObject({ stopped: "redirect", redirect: { code: 302, url: "/r/p" } });
  });

  it("chains rewrites without flags, records non-matches, and caps loops", () => {
    const r = applyRewrites(loc("", "/", 0, [{ name: "rewrite", args: ["^/x$", "/y"], line: 1 }, { name: "rewrite", args: ["^/nope$", "/z"], line: 2 }, { name: "rewrite", args: ["^/y$", "/z"], line: 3 }]), "/x");
    expect(r.uri).toBe("/z");
    expect(r.steps.map((s) => s.matched)).toEqual([true, false, true]);
    const looped = applyRewrites(locations[2], "/loop/a", locations);
    expect(looped.stopped).toBe("loop");
    expect(looped.iterations).toBe(10);
  });
});

describe("simulateRequest on the sample", () => {
  it("normalises URIs first", () => {
    expect(normalizeUri("")).toBe("/");
    expect(normalizeUri("https://example.com//a/./b/../c?x=1#f")).toBe("/a/c");
    expect(normalizeUri("/caf%C3%A9")).toBe("/café");
    expect(normalizeUri("/bad%E0")).toBe("/bad%E0");
    expect(normalizeUri("about")).toBe("/about");
  });

  it("routes each example URI as nginx would", () => {
    const by = Object.fromEntries(NGINX_EXAMPLE_URIS.map((u) => [u, simulateRequest(sample, u)]));
    expect(by["/login"].match.matched?.modifier).toBe("=");
    expect(by["/login"].target).toMatchObject({ kind: "proxy", target: "http://auth:9000/login" });
    expect(by["/static/logo.png"].match.matched?.modifier).toBe("^~");
    expect(by["/static/logo.png"].target).toMatchObject({ kind: "file", path: "/srv/assets/logo.png" });
    expect(by["/images/logo.png"].match.matched?.modifier).toBe("~*");
    expect(by["/images/logo.png"].target).toMatchObject({ kind: "file", path: "/srv/media/images/logo.png" });
    expect(by["/api/v1/users"].target).toMatchObject({ kind: "proxy", target: "http://api:8080/api/v1/users" });
    expect(by["/docs/intro"].target).toMatchObject({ kind: "proxy", target: "http://docs:3000/intro" });
    expect(by["/old/page"].rewrites?.location.uri).toBe("/new/");
    expect(by["/old/page"].finalUri).toBe("/new/page");
    expect(by["/old/page"].target).toMatchObject({ kind: "file", path: "/var/www/html/new/page" });
    expect(by["/about"].match.matched?.uri).toBe("/");
    expect(by["/about"].target).toMatchObject({ kind: "file", path: "/var/www/html/about" });
  });

  it("applies server-level rewrites before matching and handles no-match", () => {
    const c = cfg("server { rewrite ^/legacy/(.*)$ /docs/$1; location /docs/ { proxy_pass http://d/; } }");
    const s = simulateRequest(c, "/legacy/x");
    expect(s.serverRewrites).toHaveLength(1);
    expect(s.match.matched?.uri).toBe("/docs/");
    expect(s.target).toMatchObject({ kind: "proxy", target: "http://d/x" });
    const redirect = simulateRequest(cfg("server { rewrite ^ https://x.io permanent; location / { } }"), "/a");
    expect(redirect.target).toEqual({ kind: "return", code: 301, url: "https://x.io" });
    const none = simulateRequest(cfg("server { root /w; location = /only { } }"), "/other");
    expect(none.match.matched).toBeNull();
    expect(none.target).toMatchObject({ kind: "file", path: "/w/other" });
  });
});
