import { describe, expect, it } from "vitest";
import {
  ASN1_MAX_BYTES,
  Asn1Error,
  TAG,
  base64UrlToBytes,
  bitStringFlags,
  bytesToBase64Url,
  bytesToHex,
  content,
  derToPem,
  oidName,
  oidToString,
  parseDer,
  pemBlocks,
  pemToDer,
  readBitString,
  readGeneralizedTime,
  readInteger,
  readString,
  readUtcTime,
} from "@/lib/tools/asn1";

const hex = (s: string) => Uint8Array.from(s.replace(/\s+/g, "").match(/../g) ?? [], (h) => parseInt(h, 16));

describe("parseDer", () => {
  it("parses a nested SEQUENCE with primitive children", () => {
    // SEQUENCE { INTEGER 5, OID 2.5.4.3, SET { NULL } }
    const der = hex("30 0c 02 01 05 06 03 55 04 03 31 02 05 00");
    const root = parseDer(der);
    expect(root.tagClass).toBe(0);
    expect(root.tag).toBe(TAG.SEQUENCE);
    expect(root.constructed).toBe(true);
    expect(root.headerLength).toBe(2);
    expect(root.length).toBe(12);
    expect(root.end).toBe(14);
    expect(root.children?.map((c) => c.tag)).toEqual([TAG.INTEGER, TAG.OID, TAG.SET]);
    expect(Array.from(content(der, root.children![0]))).toEqual([5]);
    expect(root.children![2].children?.[0].tag).toBe(TAG.NULL);
  });

  it("handles long-form lengths and context-specific tags", () => {
    const body = new Uint8Array(300).fill(0xab);
    const der = new Uint8Array([0xa3, 0x82, 0x01, 0x2c, ...body]); // [3] EXPLICIT with 300 bytes (not valid children)
    const node = parseDer(new Uint8Array([0x04, 0x82, 0x01, 0x2c, ...body]));
    expect(node.tag).toBe(TAG.OCTET_STRING);
    expect(node.length).toBe(300);
    expect(node.headerLength).toBe(4);
    // Context-specific constructed tag with garbage content is a parse error, not a hang.
    expect(() => parseDer(der)).toThrow(Asn1Error);
  });

  it("rejects indefinite lengths", () => {
    expect(() => parseDer(hex("30 80 02 01 05 00 00"))).toThrow(/Indefinite/);
  });

  it("rejects truncated and overlong elements", () => {
    expect(() => parseDer(hex("30 05 02 01"))).toThrow(Asn1Error);
    expect(() => parseDer(hex("02"))).toThrow(Asn1Error);
    expect(() => parseDer(hex("04 85 01 00 00 00 00"))).toThrow(/too long/);
    expect(() => parseDer(new Uint8Array(0))).toThrow(Asn1Error);
  });

  it("rejects input over the 1 MB cap before parsing", () => {
    expect(() => parseDer(new Uint8Array(ASN1_MAX_BYTES + 1))).toThrow(/1 MB/);
  });

  it("ignores trailing bytes after the root element and reports where it ended", () => {
    const root = parseDer(hex("05 00 ff ff"));
    expect(root.end).toBe(2);
  });
});

describe("oidToString", () => {
  it("decodes common OIDs", () => {
    expect(oidToString(hex("55 04 03"))).toBe("2.5.4.3");
    expect(oidToString(hex("2a 86 48 86 f7 0d 01 01 0b"))).toBe("1.2.840.113549.1.1.11");
    expect(oidToString(hex("2b 06 01 05 05 07 03 01"))).toBe("1.3.6.1.5.5.7.3.1");
    expect(oidToString(hex("2b 65 70"))).toBe("1.3.101.112");
    expect(oidToString(hex("09 92 26 89 93 f2 2c 64 01 19"))).toBe("0.9.2342.19200300.100.1.25");
  });

  it("rejects empty and truncated OIDs", () => {
    expect(() => oidToString(new Uint8Array(0))).toThrow(Asn1Error);
    expect(() => oidToString(hex("2a 86"))).toThrow(/Truncated/);
  });

  it("maps OIDs to friendly names and falls back to the dotted form", () => {
    expect(oidName("2.5.4.3")).toBe("CN");
    expect(oidName("1.3.101.112")).toBe("Ed25519");
    expect(oidName("2.5.29.17")).toBe("subjectAltName");
    expect(oidName("1.2.3.4")).toBe("1.2.3.4");
  });
});

describe("readInteger", () => {
  it("reads positive values, stripping the sign-padding zero", () => {
    expect(readInteger(hex("00 80"))).toEqual({ hex: "80", decimal: "128", negative: false, bits: 8 });
    expect(readInteger(hex("01 00 01"))).toEqual({ hex: "010001", decimal: "65537", negative: false, bits: 17 });
    expect(readInteger(hex("00"))).toEqual({ hex: "00", decimal: "0", negative: false, bits: 0 });
  });

  it("reads negative two's-complement values", () => {
    expect(readInteger(hex("80"))).toEqual({ hex: "80", decimal: "-128", negative: true, bits: 8 });
    expect(readInteger(hex("ff"))).toEqual({ hex: "01", decimal: "-1", negative: true, bits: 1 });
  });

  it("reports the bit length of a large modulus-like value", () => {
    const modulus = new Uint8Array(257);
    modulus[1] = 0xc0; // 0x00 pad + high bit set => 2048 bits
    expect(readInteger(modulus).bits).toBe(2048);
  });
});

describe("time readers", () => {
  it("reads UTCTime with the RFC 5280 century rule", () => {
    expect(readUtcTime("260929174420Z")?.toISOString()).toBe("2026-09-29T17:44:20.000Z");
    expect(readUtcTime("500101000000Z")?.toISOString()).toBe("1950-01-01T00:00:00.000Z");
    expect(readUtcTime("491231235959Z")?.toISOString()).toBe("2049-12-31T23:59:59.000Z");
    expect(readUtcTime("2609291744+0530")?.toISOString()).toBe("2026-09-29T12:14:00.000Z");
  });

  it("reads GeneralizedTime with optional fractions", () => {
    expect(readGeneralizedTime("20360926174420Z")?.toISOString()).toBe("2036-09-26T17:44:20.000Z");
    expect(readGeneralizedTime("20360926174420.5Z")?.toISOString()).toBe("2036-09-26T17:44:20.500Z");
    expect(readGeneralizedTime("2036092617Z")?.toISOString()).toBe("2036-09-26T17:00:00.000Z");
  });

  it("returns null for malformed or impossible dates", () => {
    expect(readUtcTime("garbage")).toBeNull();
    expect(readUtcTime("261332174420Z")).toBeNull();
    expect(readGeneralizedTime("20360230174420Z")).toBeNull();
    expect(readGeneralizedTime("")).toBeNull();
  });
});

describe("bit strings and strings", () => {
  it("reads BIT STRING flags in MSB-first order", () => {
    const bits = readBitString(hex("01 06"));
    expect(bits.unusedBits).toBe(1);
    expect(bitStringFlags(bits, ["a", "b", "c", "d", "e", "f", "g", "h", "i"])).toEqual(["f", "g"]);
    expect(bitStringFlags(readBitString(hex("00 80 80")), ["a", "b", "c", "d", "e", "f", "g", "h", "i"])).toEqual(["a", "i"]);
    expect(() => readBitString(hex("09 00"))).toThrow(Asn1Error);
  });

  it("decodes UTF8, IA5, BMP and Universal strings", () => {
    expect(readString(TAG.UTF8_STRING, new TextEncoder().encode("Pune ✓"))).toBe("Pune ✓");
    expect(readString(TAG.IA5_STRING, hex("61 62 63"))).toBe("abc");
    expect(readString(TAG.PRINTABLE_STRING, hex("44 65 76 42 6f 78"))).toBe("DevBox");
    expect(readString(TAG.BMP_STRING, hex("00 41 20 ac"))).toBe("A€");
    expect(readString(TAG.UNIVERSAL_STRING, hex("00 00 00 41 00 01 f6 00"))).toBe("A😀");
    expect(readString(TAG.OCTET_STRING, hex("de ad"))).toBe("#dead");
  });
});

describe("PEM and base64 helpers", () => {
  const der = hex("30 03 02 01 05");

  it("round-trips DER through PEM with 64-column lines", () => {
    const long = new Uint8Array(100).fill(1);
    const pem = derToPem(long, "TEST");
    const lines = pem.trim().split("\n");
    expect(lines[0]).toBe("-----BEGIN TEST-----");
    expect(lines[lines.length - 1]).toBe("-----END TEST-----");
    expect(lines.slice(1, -1).every((l) => l.length <= 64)).toBe(true);
    const back = pemToDer(pem);
    expect(back.ok && back.label).toBe("TEST");
    expect(back.ok && Array.from(back.der)).toEqual(Array.from(long));
  });

  it("accepts armoured blocks with CRLF and surrounding noise", () => {
    const pem = `subject=CN=x\r\n-----BEGIN CERTIFICATE-----\r\n${btoa(String.fromCharCode(...der))}\r\n-----END CERTIFICATE-----\r\n`;
    const r = pemToDer(pem);
    expect(r.ok && r.label).toBe("CERTIFICATE");
    expect(r.ok && Array.from(r.der)).toEqual(Array.from(der));
  });

  it("accepts raw base64 with whitespace and no armour", () => {
    const r = pemToDer("MA MC\n AQU=");
    expect(r.ok && r.label).toBe("");
    expect(r.ok && Array.from(r.der)).toEqual(Array.from(der));
  });

  it("lists every block in a bundle", () => {
    const one = derToPem(der, "CERTIFICATE");
    const blocks = pemBlocks(one + derToPem(der, "PRIVATE KEY") + one);
    expect(blocks.map((b) => b.label)).toEqual(["CERTIFICATE", "PRIVATE KEY", "CERTIFICATE"]);
  });

  it("reports empty input, mismatched armour and non-base64", () => {
    expect(pemToDer("   ")).toEqual({ ok: false, error: "Input is empty." });
    expect(pemToDer("-----BEGIN CERTIFICATE-----\nMAMCAQU=\n-----END PUBLIC KEY-----").ok).toBe(false);
    expect(pemToDer("-----BEGIN CERTIFICATE-----\n@@@@\n-----END CERTIFICATE-----").ok).toBe(false);
    expect(pemToDer("not base64!").ok).toBe(false);
  });

  it("encodes hex and base64url", () => {
    expect(bytesToHex(hex("de ad be ef"), ":", true)).toBe("DE:AD:BE:EF");
    expect(bytesToHex(hex("0a"))).toBe("0a");
    const bytes = hex("fb ff fe 00");
    expect(bytesToBase64Url(bytes)).toBe("-__-AA");
    expect(Array.from(base64UrlToBytes("-__-AA"))).toEqual(Array.from(bytes));
  });
});
