import { describe, expect, it } from "vitest";
import { buildRequest, CODE_TARGETS, generateCode, parseKeyValueLines, REQUEST_SAMPLE, shellQuote, toCurl, type RequestModel, type ResolvedRequest } from "@/lib/tools/http-request";

function model(overrides: Partial<RequestModel> = {}): RequestModel {
  return {
    method: "GET",
    url: "https://api.example.com/items",
    headers: [],
    query: [],
    auth: { type: "none" },
    body: { type: "none", content: "" },
    ...overrides,
  };
}

function ok(m: RequestModel): ResolvedRequest {
  const r = buildRequest(m);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("buildRequest: URL and query", () => {
  it("merges enabled query rows into the URL with encoding", () => {
    const r = ok(model({ query: [{ key: "q", value: "a b&c", enabled: true }, { key: "skip", value: "1", enabled: false }] }));
    expect(r.url).toBe("https://api.example.com/items?q=a%20b%26c");
  });

  it("keeps query params already in the URL and appends new ones", () => {
    const r = ok(model({ url: "https://x.test/p?a=1#frag", query: [{ key: "b", value: "2", enabled: true }] }));
    expect(r.url).toBe("https://x.test/p?a=1&b=2#frag");
  });

  it("does not add a trailing slash or touch a bare URL", () => {
    expect(ok(model({ url: "https://api.example.com" })).url).toBe("https://api.example.com");
  });

  it("assumes https when the scheme is missing and warns", () => {
    const r = ok(model({ url: "api.example.com/v1" }));
    expect(r.url).toBe("https://api.example.com/v1");
    expect(r.warnings[0]).toMatch(/https/);
  });

  it("rejects an empty or invalid URL", () => {
    expect(buildRequest(model({ url: "  " }))).toEqual({ ok: false, error: "Enter a URL." });
    expect(buildRequest(model({ url: "http://exa mple" })).ok).toBe(false);
  });
});

describe("buildRequest: headers, auth and body", () => {
  it("applies bearer auth and infers Content-Type for JSON", () => {
    const r = ok(model({ method: "POST", auth: { type: "bearer", token: "t0k" }, body: { type: "json", content: '{"a":1}' } }));
    expect(r.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
      { name: "Authorization", value: "Bearer t0k" },
    ]);
    expect(r.body).toBe('{"a":1}');
    expect(r.bodyBytes).toBe(7);
  });

  it("encodes basic auth as base64 of user:pass", () => {
    const r = ok(model({ auth: { type: "basic", username: "ada", password: "s3cret" } }));
    expect(r.headers).toEqual([{ name: "Authorization", value: `Basic ${btoa("ada:s3cret")}` }]);
    expect(r.basicAuth).toEqual({ username: "ada", password: "s3cret" });
  });

  it("puts an API key in a header or in the query", () => {
    expect(ok(model({ auth: { type: "api-key", token: "k", headerName: "X-Key", in: "header" } })).headers).toEqual([{ name: "X-Key", value: "k" }]);
    const q = ok(model({ auth: { type: "api-key", token: "k", headerName: "key", in: "query" } }));
    expect(q.url).toBe("https://api.example.com/items?key=k");
    expect(q.headers).toEqual([]);
  });

  it("lets the last duplicate header win, case-insensitively, and skips disabled rows", () => {
    const r = ok(
      model({
        headers: [
          { key: "Accept", value: "text/html", enabled: true },
          { key: "accept", value: "application/json", enabled: true },
          { key: "X-Off", value: "1", enabled: false },
        ],
      }),
    );
    expect(r.headers).toEqual([{ name: "accept", value: "application/json" }]);
  });

  it("keeps an explicit Content-Type over the inferred one", () => {
    const r = ok(model({ method: "POST", headers: [{ key: "Content-Type", value: "application/vnd.api+json", enabled: true }], body: { type: "json", content: "{}" } }));
    expect(r.headers).toEqual([{ name: "Content-Type", value: "application/vnd.api+json" }]);
  });

  it("form-encodes key=value lines and warns about invalid JSON", () => {
    const form = ok(model({ method: "POST", body: { type: "form", content: "name=Ada Lovelace\nrole=admin&x" } }));
    expect(form.body).toBe("name=Ada+Lovelace&role=admin%26x");
    expect(form.headers[0]).toEqual({ name: "Content-Type", value: "application/x-www-form-urlencoded" });
    const bad = ok(model({ method: "POST", body: { type: "json", content: "{oops" } }));
    expect(bad.warnings.some((w) => /not valid JSON/.test(w))).toBe(true);
  });

  it("parses multipart fields, marks files and drops a manual Content-Type", () => {
    const r = ok(model({ method: "POST", headers: [{ key: "Content-Type", value: "multipart/form-data", enabled: true }], body: { type: "multipart", content: "title=Hello\nfile=@./photo.png" } }));
    expect(r.body).toBeNull();
    expect(r.formFields).toEqual([
      { name: "title", value: "Hello", file: false },
      { name: "file", value: "./photo.png", file: true },
    ]);
    expect(r.headers).toEqual([]);
    expect(r.warnings.some((w) => /boundary/.test(w))).toBe(true);
  });

  it("wraps a GraphQL query in a JSON envelope and warns about GET bodies", () => {
    const r = ok(model({ method: "GET", body: { type: "graphql", content: "{ me { id } }" } }));
    expect(r.body).toBe('{"query":"{ me { id } }"}');
    expect(r.headers[0].value).toBe("application/json");
    expect(r.warnings.some((w) => /GET requests normally carry no body/.test(w))).toBe(true);
  });

  it("parseKeyValueLines handles ampersand and newline forms", () => {
    expect(parseKeyValueLines("a=1&b=2")).toEqual([
      { name: "a", value: "1", file: false },
      { name: "b", value: "2", file: false },
    ]);
    expect(parseKeyValueLines("\n a = 1 \n\nflag\n")).toEqual([
      { name: "a", value: " 1", file: false },
      { name: "flag", value: "", file: false },
    ]);
  });
});

describe("code generation", () => {
  it("shellQuote escapes single quotes POSIX-style", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("generates multi-line curl with -X, -H and --data-raw", () => {
    const r = generateCode(REQUEST_SAMPLE, "curl");
    if (!r.ok) throw new Error(r.error);
    const lines = r.code.split(" \\\n  ");
    expect(lines[0]).toBe("curl -X POST 'https://api.example.com/v1/users?expand=profile'");
    expect(lines).toContain("-H 'Authorization: Bearer YOUR_TOKEN'");
    expect(lines).toContain("-H 'Content-Type: application/json'");
    expect(lines[lines.length - 1]).toMatch(/^--data-raw '\{/);
  });

  it("curl omits -X for GET, uses -u for basic auth and -F for multipart", () => {
    const basic = toCurl(ok(model({ auth: { type: "basic", username: "u", password: "p'q" } })));
    expect(basic).toBe("curl 'https://api.example.com/items' \\\n  -u 'u:p'\\''q'");
    const multi = toCurl(ok(model({ method: "POST", body: { type: "multipart", content: "a=1\nf=@x.png" } })));
    expect(multi).toContain("-F 'a=1'");
    expect(multi).toContain("-F 'f=@x.png'");
    expect(multi).not.toContain("--data-raw");
  });

  it("generates fetch with JSON.stringify and a headers object", () => {
    const r = generateCode(REQUEST_SAMPLE, "fetch");
    if (!r.ok) throw new Error(r.error);
    expect(r.code).toContain('await fetch("https://api.example.com/v1/users?expand=profile", {');
    expect(r.code).toContain('method: "POST"');
    expect(r.code).toContain('"Authorization": "Bearer YOUR_TOKEN"');
    expect(r.code).toContain("body: JSON.stringify({");
    expect(r.code).toContain("const data = await response.json();");
  });

  it("generates axios with native basic auth instead of a header", () => {
    const r = generateCode(model({ auth: { type: "basic", username: "u", password: "p" } }), "axios");
    if (!r.ok) throw new Error(r.error);
    expect(r.code).toContain('auth: { username: "u", password: "p" }');
    expect(r.code).not.toContain("Authorization");
    expect(r.code).toContain('method: "get"');
  });

  it("generates HTTPie with key=value items, --auth and -f for forms", () => {
    const json = generateCode(REQUEST_SAMPLE, "httpie");
    if (!json.ok) throw new Error(json.error);
    expect(json.code.split(" \\\n  ")[0]).toBe("http POST 'https://api.example.com/v1/users?expand=profile'");
    expect(json.code).toContain("'name=Ada Lovelace'");
    expect(json.code).toContain("'roles:=[\"admin\"]'");
    expect(json.code).toContain("'Authorization:Bearer YOUR_TOKEN'");
    expect(json.code).not.toContain("Content-Type");
    const form = generateCode(model({ method: "POST", auth: { type: "basic", username: "u", password: "p" }, body: { type: "form", content: "a=1" } }), "httpie");
    if (!form.ok) throw new Error(form.error);
    expect(form.code).toContain("http --auth 'u:p' -f POST");
    expect(form.code).toContain("'a=1'");
  });

  it("generates Python requests with json= and auth=", () => {
    const r = generateCode({ ...REQUEST_SAMPLE, auth: { type: "basic", username: "u", password: "p" }, body: { type: "json", content: '{"ok": true, "n": null}' } }, "python");
    if (!r.ok) throw new Error(r.error);
    expect(r.code).toContain("import requests");
    expect(r.code).toContain('"ok": True');
    expect(r.code).toContain('"n": None');
    expect(r.code).toContain('response = requests.post(url, headers=headers, auth=("u", "p"), json=payload)');
  });

  it("generates Go net/http with headers and SetBasicAuth", () => {
    const r = generateCode({ ...REQUEST_SAMPLE, auth: { type: "basic", username: "u", password: "p" } }, "go");
    if (!r.ok) throw new Error(r.error);
    expect(r.code).toContain('req, err := http.NewRequest("POST", "https://api.example.com/v1/users?expand=profile", body)');
    expect(r.code).toContain('req.Header.Set("Content-Type", "application/json")');
    expect(r.code).toContain('req.SetBasicAuth("u", "p")');
    expect(r.code).toContain('"net/http"');
  });

  it("produces non-empty code for every target and surfaces URL errors", () => {
    for (const t of CODE_TARGETS) {
      const r = generateCode(REQUEST_SAMPLE, t.id);
      expect(r.ok && r.code.length > 20).toBe(true);
    }
    expect(generateCode(model({ url: "" }), "curl")).toEqual({ ok: false, error: "Enter a URL." });
  });
});
