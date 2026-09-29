import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, buildOtpauthUri, generateHotp, generateTotp, MAX_SECRET_CHARS, parseOtpauthUri, randomBase32Secret, TOTP_SAMPLE } from "@/lib/tools/totp";

const ascii = (s: string) => new TextEncoder().encode(s);
const SECRET20 = "12345678901234567890";
const SECRET32 = "12345678901234567890123456789012";
const SECRET64 = "1234567890123456789012345678901234567890123456789012345678901234";
const SECRET20_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32", () => {
  it("encodes the RFC 6238 secret and decodes it back", () => {
    expect(base32Encode(ascii(SECRET20))).toBe(SECRET20_B32);
    const d = base32Decode(SECRET20_B32);
    expect(d.ok && new TextDecoder().decode(d.bytes)).toBe(SECRET20);
  });

  it("round-trips arbitrary byte lengths including ones that need padding", () => {
    for (let n = 1; n <= 12; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
      const d = base32Decode(base32Encode(bytes));
      expect(d.ok && Array.from(d.bytes)).toEqual(Array.from(bytes));
    }
    expect(base32Encode(ascii("f"))).toBe("MY");
    expect(base32Encode(ascii("foobar"))).toBe("MZXW6YTBOI");
  });

  it("is case-insensitive and ignores spaces, dashes and padding", () => {
    const d = base32Decode("mzxw 6ytb-oi======");
    expect(d.ok && new TextDecoder().decode(d.bytes)).toBe("foobar");
  });

  it("rejects invalid characters, empty input and over-long input", () => {
    const bad = base32Decode("ABC189");
    expect(!bad.ok && bad.error).toMatch(/"1" is not a Base32 character/);
    expect(base32Decode("").ok).toBe(false);
    expect(base32Decode("A").ok).toBe(false);
    const long = base32Decode("A".repeat(MAX_SECRET_CHARS + 1));
    expect(!long.ok && long.error).toMatch(/limited/);
  });

  it("generates random secrets of the requested size", () => {
    const s = randomBase32Secret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(randomBase32Secret(10)).toHaveLength(16);
    expect(randomBase32Secret()).not.toBe(s);
  });
});

describe("generateHotp (RFC 4226 vectors)", () => {
  it("matches counters 0..9", async () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    for (let c = 0; c < expected.length; c++) {
      expect(await generateHotp(ascii(SECRET20), c, "SHA1", 6)).toBe(expected[c]);
    }
  });

  it("rejects negative or fractional counters", async () => {
    await expect(generateHotp(ascii(SECRET20), -1)).rejects.toThrow(/Counter/);
    await expect(generateHotp(ascii(SECRET20), 1.5)).rejects.toThrow(/Counter/);
  });
});

describe("generateTotp (RFC 6238 vectors)", () => {
  it("matches SHA1 vectors with 8 digits", async () => {
    const at = async (t: number) => generateTotp({ secret: SECRET20_B32, algorithm: "SHA1", digits: 8, period: 30, timestampMs: t * 1000 });
    const r59 = await at(59);
    expect(r59).toEqual({ ok: true, code: "94287082", remainingSeconds: 1, counter: 1 });
    expect((await at(1111111109)).ok && (await at(1111111109) as { code: string }).code).toBe("07081804");
    expect((await at(1234567890) as { code: string }).code).toBe("89005924");
    expect((await at(20000000000) as { code: string }).code).toBe("65353130");
  });

  it("matches SHA256 and SHA512 vectors at T=59", async () => {
    const s256 = await generateTotp({ secret: base32Encode(ascii(SECRET32)), algorithm: "SHA256", digits: 8, timestampMs: 59_000 });
    expect(s256.ok && s256.code).toBe("46119246");
    const s512 = await generateTotp({ secret: base32Encode(ascii(SECRET64)), algorithm: "SHA512", digits: 8, timestampMs: 59_000 });
    expect(s512.ok && s512.code).toBe("90693936");
  });

  it("defaults to 6 digits, SHA1 and 30 seconds and reports remaining time", async () => {
    const r = await generateTotp({ secret: SECRET20_B32, timestampMs: 1234567890_000 });
    expect(r).toEqual({ ok: true, code: "005924", remainingSeconds: 30, counter: 41152263 });
    const r2 = await generateTotp({ secret: SECRET20_B32, timestampMs: 1234567890_000 + 29_999 });
    expect(r2.ok && r2.remainingSeconds).toBe(1);
  });

  it("rejects bad periods, digits and secrets", async () => {
    expect((await generateTotp({ secret: SECRET20_B32, period: 0 })).ok).toBe(false);
    expect((await generateTotp({ secret: SECRET20_B32, period: 99999 })).ok).toBe(false);
    expect((await generateTotp({ secret: SECRET20_B32, digits: 4 as never })).ok).toBe(false);
    const bad = await generateTotp({ secret: "not!base32" });
    expect(!bad.ok && bad.error).toMatch(/Base32/);
  });
});

describe("otpauth URIs", () => {
  it("parses a Google Authenticator style URI", () => {
    const r = parseOtpauthUri("otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30");
    expect(r).toEqual({
      ok: true,
      config: { type: "totp", label: "ACME Co:john.doe@email.com", issuer: "ACME Co", account: "john.doe@email.com", secret: "HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ", algorithm: "SHA1", digits: 6, period: 30, counter: 0 },
    });
  });

  it("applies defaults, takes the issuer from the label and normalises algorithm spelling", () => {
    const r = parseOtpauthUri("otpauth://TOTP/DevBox:ada?secret=jbswy3dpehpk3pxp&algorithm=sha-256&digits=8");
    if (!r.ok) throw new Error(r.error);
    expect(r.config).toMatchObject({ issuer: "DevBox", account: "ada", secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA256", digits: 8, period: 30 });
    const plain = parseOtpauthUri("otpauth://totp/ada?secret=JBSWY3DPEHPK3PXP");
    expect(plain.ok && plain.config).toMatchObject({ issuer: "", account: "ada", algorithm: "SHA1", digits: 6 });
  });

  it("parses hotp URIs and requires a counter", () => {
    const r = parseOtpauthUri("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=7");
    expect(r.ok && r.config).toMatchObject({ type: "hotp", counter: 7 });
    expect(parseOtpauthUri("otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP").ok).toBe(false);
  });

  it("reports malformed URIs clearly", () => {
    expect(parseOtpauthUri("https://example.com").ok).toBe(false);
    const noSecret = parseOtpauthUri("otpauth://totp/x?issuer=y");
    expect(!noSecret.ok && noSecret.error).toMatch(/no secret/);
    const badDigits = parseOtpauthUri("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=5");
    expect(!badDigits.ok && badDigits.error).toMatch(/digits/);
    expect(parseOtpauthUri("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5").ok).toBe(false);
    expect(parseOtpauthUri("otpauth://totp/%E0%A4%A?secret=JBSWY3DPEHPK3PXP").ok).toBe(false);
    expect(parseOtpauthUri(`otpauth://totp/x?secret=${"A".repeat(5000)}`).ok).toBe(false);
  });

  it("builds a URI that parses back to the same config", () => {
    const uri = buildOtpauthUri({ issuer: "ACME Co", account: "john@example.com", secret: "jbsw y3dp-ehpk3pxp", algorithm: "SHA512", digits: 7, period: 60 });
    expect(uri).toBe("otpauth://totp/ACME%20Co:john%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA512&digits=7&period=60");
    const back = parseOtpauthUri(uri);
    expect(back.ok && back.config).toMatchObject({ issuer: "ACME Co", account: "john@example.com", secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA512", digits: 7, period: 60 });
    expect(buildOtpauthUri({ account: "a", secret: TOTP_SAMPLE.secret, type: "hotp", counter: 3 })).toBe("otpauth://hotp/a?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&counter=3");
  });
});
