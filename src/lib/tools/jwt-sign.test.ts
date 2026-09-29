import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeJwt } from "@/lib/tools/jwt";
import { base64UrlEncode, decodeForEdit, defaultHeaderText, JWT_SIGN_MAX_PAYLOAD, JWT_SIGN_SAMPLE, setHeaderAlgorithm, signJwt, verifyJwt, withStandardClaims } from "@/lib/tools/jwt-sign";

const REFERENCE_PAYLOAD = '{"sub":"user_42","name":"Ada Lovelace","role":"admin"}';

describe("base64UrlEncode", () => {
  it("encodes strings and bytes without padding using the URL alphabet", () => {
    expect(base64UrlEncode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}")).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe("-_-_");
    expect(base64UrlEncode("")).toBe("");
  });
});

describe("signJwt", () => {
  it("signs the sample and the result round-trips through decodeJwt and verifyJwt", async () => {
    const r = await signJwt({ payload: JWT_SIGN_SAMPLE.payload, secret: JWT_SIGN_SAMPLE.secret, algorithm: "HS256" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.token.split(".")).toHaveLength(3);
    expect(r.header).toEqual({ alg: "HS256", typ: "JWT" });
    const decoded = decodeJwt(r.token);
    expect(decoded.ok && decoded.payload).toEqual({ sub: "user_42", name: "Ada Lovelace", role: "admin" });
    const v = await verifyJwt(r.token, JWT_SIGN_SAMPLE.secret);
    expect(v).toEqual({ ok: true, valid: true, algorithm: "HS256" });
  });

  it("matches an HMAC computed independently with node:crypto", async () => {
    const r = await signJwt({ payload: REFERENCE_PAYLOAD, secret: "devbox-secret", algorithm: "HS256" });
    if (!r.ok) throw new Error(r.error);
    const [h, p, s] = r.token.split(".");
    expect(h).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(p).toBe("eyJzdWIiOiJ1c2VyXzQyIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsInJvbGUiOiJhZG1pbiJ9");
    expect(s).toBe(createHmac("sha256", "devbox-secret").update(`${h}.${p}`).digest("base64url"));
  });

  it("produces different signature lengths for HS384 and HS512", async () => {
    const [a, b] = await Promise.all([
      signJwt({ payload: "{}", secret: "s", algorithm: "HS384" }),
      signJwt({ payload: "{}", secret: "s", algorithm: "HS512" }),
    ]);
    if (!a.ok || !b.ok) throw new Error("sign failed");
    expect(a.token.split(".")[2]).toHaveLength(64);
    expect(b.token.split(".")[2]).toHaveLength(86);
    expect(a.header.alg).toBe("HS384");
  });

  it("merges extra header fields but keeps alg and typ", async () => {
    const r = await signJwt({ header: '{"kid":"key-1","typ":"at+jwt"}', payload: "{}", secret: "s", algorithm: "HS256" });
    if (!r.ok) throw new Error(r.error);
    expect(r.header).toEqual({ alg: "HS256", typ: "at+jwt", kid: "key-1" });
    const decoded = decodeJwt(r.token);
    expect(decoded.ok && decoded.header.kid).toBe("key-1");
  });

  it("fills standard claims from the provided clock", async () => {
    const nowMs = 1_700_000_000_123;
    const r = await signJwt({ payload: '{"sub":"x"}', secret: "s", algorithm: "HS256", claims: { iat: true, expInSeconds: 3600, jti: true }, nowMs });
    if (!r.ok) throw new Error(r.error);
    expect(r.payload.iat).toBe(1_700_000_000);
    expect(r.payload.exp).toBe(1_700_003_600);
    expect(r.payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.payload.sub).toBe("x");
  });

  it("rejects alg none, non-HMAC algorithms and mismatched header alg", async () => {
    const none = await signJwt({ header: '{"alg":"none"}', payload: "{}", secret: "s", algorithm: "HS256" });
    expect(none.ok).toBe(false);
    expect(!none.ok && none.error).toMatch(/none/);
    const rs = await signJwt({ header: '{"alg":"RS256"}', payload: "{}", secret: "s", algorithm: "HS256" });
    expect(!rs.ok && rs.error).toMatch(/RS256/);
    const mismatch = await signJwt({ header: '{"alg":"HS512"}', payload: "{}", secret: "s", algorithm: "HS256" });
    expect(!mismatch.ok && mismatch.error).toMatch(/does not match/);
    const bogus = await signJwt({ payload: "{}", secret: "s", algorithm: "ES256" as never });
    expect(bogus.ok).toBe(false);
  });

  it("rejects empty secrets, invalid JSON, non-object payloads and oversized payloads", async () => {
    expect((await signJwt({ payload: "{}", secret: "", algorithm: "HS256" })).ok).toBe(false);
    const bad = await signJwt({ payload: "{oops", secret: "s", algorithm: "HS256" });
    expect(!bad.ok && bad.error).toMatch(/not valid JSON/);
    const arr = await signJwt({ payload: "[1]", secret: "s", algorithm: "HS256" });
    expect(!arr.ok && arr.error).toMatch(/JSON object/);
    const big = await signJwt({ payload: `{"a":"${"x".repeat(JWT_SIGN_MAX_PAYLOAD)}"}`, secret: "s", algorithm: "HS256" });
    expect(!big.ok && big.error).toMatch(/64 KB/);
  });

  it("treats an empty payload as {} and drops prototype-polluting keys", async () => {
    const empty = await signJwt({ payload: "  ", secret: "s", algorithm: "HS256" });
    expect(empty.ok && empty.payload).toEqual({});
    const polluted = await signJwt({ payload: '{"__proto__":{"admin":true},"ok":1}', secret: "s", algorithm: "HS256" });
    if (!polluted.ok) throw new Error(polluted.error);
    expect(Object.keys(polluted.payload)).toEqual(["ok"]);
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });
});

describe("withStandardClaims", () => {
  it("only touches the claims that are switched on", () => {
    const base = { sub: "a", exp: 1 };
    const out = withStandardClaims(base, { iat: false, nbf: 5.9 }, 10_000);
    expect(out).toEqual({ sub: "a", exp: 1, nbf: 5 });
    expect(base).toEqual({ sub: "a", exp: 1 });
    expect(withStandardClaims(base, { iat: true, expInSeconds: 60 }, 10_000)).toEqual({ sub: "a", iat: 10, exp: 70 });
  });
});

describe("verifyJwt", () => {
  it("reports an invalid signature for the wrong secret or a tampered payload", async () => {
    const r = await signJwt({ payload: '{"sub":"a"}', secret: "right", algorithm: "HS512" });
    if (!r.ok) throw new Error(r.error);
    expect(await verifyJwt(r.token, "wrong")).toEqual({ ok: true, valid: false, algorithm: "HS512" });
    const [h, , s] = r.token.split(".");
    const tampered = `${h}.${base64UrlEncode('{"sub":"b"}')}.${s}`;
    expect(await verifyJwt(tampered, "right")).toEqual({ ok: true, valid: false, algorithm: "HS512" });
    expect(await verifyJwt(`Bearer ${r.token}`, "right")).toEqual({ ok: true, valid: true, algorithm: "HS512" });
  });

  it("refuses alg none, asymmetric algorithms, malformed tokens and empty secrets", async () => {
    const none = `${base64UrlEncode('{"alg":"none"}')}.${base64UrlEncode("{}")}.`;
    const r1 = await verifyJwt(none, "s");
    expect(!r1.ok && r1.error).toMatch(/none/);
    const rs = `${base64UrlEncode('{"alg":"RS256"}')}.${base64UrlEncode("{}")}.abc`;
    const r2 = await verifyJwt(rs, "s");
    expect(!r2.ok && r2.error).toMatch(/RS256/);
    expect((await verifyJwt("not.a", "s")).ok).toBe(false);
    const r = await signJwt({ payload: "{}", secret: "s", algorithm: "HS256" });
    expect(r.ok && (await verifyJwt(r.token, "")).ok).toBe(false);
  });
});

describe("decodeForEdit and header helpers", () => {
  it("returns pretty JSON and the algorithm for an HMAC token", async () => {
    const r = await signJwt({ header: '{"kid":"k"}', payload: '{"sub":"a"}', secret: "s", algorithm: "HS384" });
    if (!r.ok) throw new Error(r.error);
    const e = decodeForEdit(r.token);
    expect(e.ok && e.algorithm).toBe("HS384");
    expect(e.ok && JSON.parse(e.header)).toEqual({ alg: "HS384", typ: "JWT", kid: "k" });
    expect(e.ok && e.payload).toBe('{\n  "sub": "a"\n}');
    const rs = decodeForEdit(`${base64UrlEncode('{"alg":"RS256"}')}.${base64UrlEncode("{}")}.x`);
    expect(rs.ok && rs.algorithm).toBeNull();
    expect(decodeForEdit("garbage").ok).toBe(false);
  });

  it("rewrites alg in header text while preserving other fields", () => {
    expect(setHeaderAlgorithm(defaultHeaderText("HS256"), "HS512")).toBe(defaultHeaderText("HS512"));
    expect(JSON.parse(setHeaderAlgorithm('{"kid":"k","alg":"HS256"}', "HS384"))).toEqual({ alg: "HS384", typ: "JWT", kid: "k" });
    expect(setHeaderAlgorithm("{not json", "HS256")).toBe("{not json");
    expect(JSON.parse(setHeaderAlgorithm("", "HS256"))).toEqual({ alg: "HS256", typ: "JWT" });
  });
});
