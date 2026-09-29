import { pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as bcryptjs from "bcryptjs";
import { BCRYPT_MAX_COST, bcryptHash, bcryptTruncationWarning, bcryptVerify, detectHashKind, inspectBcryptHash, parsePbkdf2Phc, PASSWORD_HASH_SAMPLE, pbkdf2Hash, pbkdf2Verify, PBKDF2_MAX_ITERATIONS, type BcryptModule } from "@/lib/tools/password-hash";

const mod: BcryptModule = bcryptjs;
const FIXED_SALT = Uint8Array.from({ length: 16 }, (_, i) => i * 17);

describe("bcrypt", () => {
  it("hashes and verifies with the real bcryptjs module at cost 4", async () => {
    const h = await bcryptHash(mod, PASSWORD_HASH_SAMPLE.password, 4);
    if (!h.ok) throw new Error(h.error);
    expect(h.hash).toMatch(/^\$2[ab]\$04\$[./A-Za-z0-9]{53}$/);
    expect(h.cost).toBe(4);
    expect(h.salt).toHaveLength(22);
    expect(h.hashPart).toHaveLength(31);
    expect(mod.getRounds(h.hash)).toBe(4);
    expect(await bcryptVerify(mod, PASSWORD_HASH_SAMPLE.password, h.hash)).toEqual({ ok: true, match: true, cost: 4, version: h.version });
    expect(await bcryptVerify(mod, "wrong password", h.hash)).toMatchObject({ ok: true, match: false });
    const again = await bcryptHash(mod, PASSWORD_HASH_SAMPLE.password, 4);
    expect(again.ok && again.hash).not.toBe(h.hash); // fresh salt every time
  });

  it("inspects a hash string and rejects malformed ones", () => {
    const parts = inspectBcryptHash("$2y$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234");
    expect(parts).toEqual({ ok: true, version: "2y", cost: 10, salt: "abcdefghijklmnopqrstuu", hashPart: "ABCDEFGHIJKLMNOPQRSTUVWXYZ01234" });
    expect(inspectBcryptHash("$2b$10$tooshort").ok).toBe(false);
    expect(inspectBcryptHash("$pbkdf2-sha256$i=1$AA$AA").ok).toBe(false);
    const x = inspectBcryptHash("$2x$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234");
    expect(!x.ok && x.error).toMatch(/\$2x\$/);
  });

  it("validates cost and password before touching bcrypt", async () => {
    expect((await bcryptHash(mod, "pw", 3)).ok).toBe(false);
    expect((await bcryptHash(mod, "pw", BCRYPT_MAX_COST + 1)).ok).toBe(false);
    expect((await bcryptHash(mod, "pw", 4.5)).ok).toBe(false);
    expect((await bcryptHash(mod, "", 4)).ok).toBe(false);
    const v = await bcryptVerify(mod, "pw", "nope");
    expect(!v.ok && v.error).toMatch(/Not a bcrypt hash/);
    expect((await bcryptVerify(mod, "", "$2b$04$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234")).ok).toBe(false);
  });

  it("warns when the password exceeds 72 UTF-8 bytes", () => {
    expect(bcryptTruncationWarning("a".repeat(72))).toBe(false);
    expect(bcryptTruncationWarning("a".repeat(73))).toBe(true);
    expect(bcryptTruncationWarning("é".repeat(37))).toBe(true); // 74 bytes
  });
});

describe("PBKDF2", () => {
  it("is deterministic for a fixed salt and agrees with node's pbkdf2Sync", async () => {
    const r = await pbkdf2Hash({ password: "hunter2", iterations: 1000, hash: "SHA-256", salt: FIXED_SALT, keyLength: 32 });
    if (!r.ok) throw new Error(r.error);
    const expected = pbkdf2Sync("hunter2", FIXED_SALT, 1000, 32, "sha256");
    expect(r.hex).toBe(expected.toString("hex"));
    expect(r.base64).toBe(expected.toString("base64"));
    expect(r.saltHex).toBe(Buffer.from(FIXED_SALT).toString("hex"));
    expect(r.phc).toBe(`$pbkdf2-sha256$i=1000$${Buffer.from(FIXED_SALT).toString("base64").replace(/=+$/, "")}$${expected.toString("base64").replace(/=+$/, "")}`);
    const again = await pbkdf2Hash({ password: "hunter2", iterations: 1000, hash: "SHA-256", salt: FIXED_SALT, keyLength: 32 });
    expect(again.ok && again.hex).toBe(r.hex);
  });

  it("supports SHA-512 with a longer key", async () => {
    const r = await pbkdf2Hash({ password: "hunter2", iterations: 500, hash: "SHA-512", salt: FIXED_SALT, keyLength: 64 });
    if (!r.ok) throw new Error(r.error);
    expect(r.hex).toBe(pbkdf2Sync("hunter2", FIXED_SALT, 500, 64, "sha512").toString("hex"));
    expect(r.phc.startsWith("$pbkdf2-sha512$i=500$")).toBe(true);
  });

  it("uses a fresh random salt when none is given", async () => {
    const a = await pbkdf2Hash({ password: "pw", iterations: 10 });
    const b = await pbkdf2Hash({ password: "pw", iterations: 10 });
    expect(a.ok && b.ok && a.saltHex !== b.saltHex).toBe(true);
    expect(a.ok && a.saltHex).toHaveLength(32);
    expect(a.ok && a.iterations).toBe(10);
  });

  it("parses and verifies PHC strings, including padded Base64", async () => {
    const r = await pbkdf2Hash({ password: "pw", iterations: 200, salt: FIXED_SALT });
    if (!r.ok) throw new Error(r.error);
    expect(await pbkdf2Verify("pw", r.phc)).toEqual({ ok: true, match: true, iterations: 200, hash: "SHA-256", keyLength: 32 });
    expect(await pbkdf2Verify("pw2", r.phc)).toMatchObject({ ok: true, match: false });
    const padded = `$pbkdf2-sha256$i=200$${Buffer.from(FIXED_SALT).toString("base64")}$${r.base64}`;
    expect(await pbkdf2Verify("pw", padded)).toMatchObject({ ok: true, match: true });
    const parsed = parsePbkdf2Phc(r.phc);
    expect(parsed.ok && Array.from(parsed.salt)).toEqual(Array.from(FIXED_SALT));
  });

  it("rejects malformed PHC strings and out-of-range parameters", async () => {
    expect(parsePbkdf2Phc("$2b$04$abc").ok).toBe(false);
    expect(parsePbkdf2Phc("$pbkdf2-sha1$i=1$AAAAAAAAAAA$AAAA").ok).toBe(false);
    expect(parsePbkdf2Phc("$pbkdf2-sha256$i=1$!!!$AAAA").ok).toBe(false);
    expect(parsePbkdf2Phc("$pbkdf2-sha256$i=1$AAAAAAAAAAA$AAAA").ok).toBe(false); // 3-byte key
    const hugeIter = parsePbkdf2Phc(`$pbkdf2-sha256$i=99999999$AAAAAAAAAAA$${"A".repeat(43)}`);
    expect(!hugeIter.ok && hugeIter.error).toMatch(/Iterations/);
    expect((await pbkdf2Hash({ password: "pw", iterations: PBKDF2_MAX_ITERATIONS + 1 })).ok).toBe(false);
    expect((await pbkdf2Hash({ password: "pw", iterations: 0 })).ok).toBe(false);
    expect((await pbkdf2Hash({ password: "pw", keyLength: 8 })).ok).toBe(false);
    expect((await pbkdf2Hash({ password: "", iterations: 10 })).ok).toBe(false);
    expect((await pbkdf2Verify("", "$pbkdf2-sha256$i=1$AAAAAAAAAAA$AAAA")).ok).toBe(false);
  });
});

describe("detectHashKind", () => {
  it("recognises bcrypt and PBKDF2 strings", () => {
    expect(detectHashKind(" $2b$10$x ")).toBe("bcrypt");
    expect(detectHashKind("$pbkdf2-sha512$i=1$a$b")).toBe("pbkdf2");
    expect(detectHashKind("hello")).toBeNull();
  });
});
