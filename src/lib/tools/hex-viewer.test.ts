import { describe, expect, it } from "vitest";
import { byteDetails, byteStats, bytesFromText, detectFileType, hexDump, MAX_HEX_BYTES, parseHexInput, toBase64, toBinaryString, toHexString } from "@/lib/tools/hex-viewer";

const bytes = (...b: number[]) => Uint8Array.from(b);

describe("bytesFromText", () => {
  it("encodes UTF-8, UTF-16 LE and Latin-1", () => {
    expect(Array.from(bytesFromText("hé", "utf-8"))).toEqual([0x68, 0xc3, 0xa9]);
    expect(Array.from(bytesFromText("hé", "utf-16le"))).toEqual([0x68, 0x00, 0xe9, 0x00]);
    expect(Array.from(bytesFromText("hé€", "latin1"))).toEqual([0x68, 0xe9, 0x3f]);
  });
});

describe("parseHexInput", () => {
  it.each([
    ["48 65 6c", [0x48, 0x65, 0x6c]],
    ["0x48,0x65,0x6c", [0x48, 0x65, 0x6c]],
    ["48656c", [0x48, 0x65, 0x6c]],
    ["\\x48\\x65\\x6c", [0x48, 0x65, 0x6c]],
    ["48\n65\r\n6C", [0x48, 0x65, 0x6c]],
    ["", []],
  ])("parses %j", (input, expected) => {
    const r = parseHexInput(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.from(r.bytes)).toEqual(expected);
  });

  it("rejects odd digit counts and non-hex characters", () => {
    expect(parseHexInput("abc")).toMatchObject({ ok: false });
    const r = parseHexInput("48 zz");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/“z”/);
  });

  it("caps the byte count", () => {
    const r = parseHexInput("00".repeat(MAX_HEX_BYTES + 1));
    expect(r.ok).toBe(false);
  });
});

describe("hexDump", () => {
  it("lays out 16 bytes per row with offsets and an ASCII column", () => {
    const data = bytesFromText("Hello, World! This is a test.", "utf-8");
    const rows = hexDump(data);
    expect(rows).toHaveLength(2);
    expect(rows[0].offset).toBe("00000000");
    expect(rows[0].hex).toEqual(["48", "65", "6c", "6c", "6f", "2c", "20", "57", "6f", "72", "6c", "64", "21", "20", "54", "68"]);
    expect(rows[0].ascii).toBe("Hello, World! Th");
    expect(rows[1].offset).toBe("00000010");
    expect(rows[1].index).toBe(16);
    expect(rows[1].hex).toHaveLength(13);
    expect(rows[1].ascii).toBe("is is a test.");
  });

  it("replaces non-printables with dots and honours uppercase / decimal / grouping", () => {
    const rows = hexDump(bytes(0x00, 0x41, 0x7f, 0xff, 0x0a, 0x20, 0x7e), { bytesPerRow: 8, offsetBase: "dec", uppercase: true, group: 2 });
    expect(rows[0].ascii).toBe(".A... ~");
    expect(rows[0].hex).toEqual(["0041", "7FFF", "0A20", "7E"]);
    expect(rows[0].offset).toBe("00000000");
    const rows2 = hexDump(new Uint8Array(20), { bytesPerRow: 8, offsetBase: "dec" });
    expect(rows2.map((r) => r.offset)).toEqual(["00000000", "00000008", "00000016"]);
  });

  it("returns no rows for empty input and caps at the byte limit", () => {
    expect(hexDump(new Uint8Array(0))).toEqual([]);
    const rows = hexDump(new Uint8Array(MAX_HEX_BYTES + 64), { bytesPerRow: 32 });
    expect(rows).toHaveLength(MAX_HEX_BYTES / 32);
  });
});

describe("string exports", () => {
  it("formats hex, base64 and binary", () => {
    const b = bytesFromText("Hi!", "utf-8");
    expect(toHexString(b)).toBe("48 69 21");
    expect(toHexString(b, "", true)).toBe("486921");
    expect(toBase64(b)).toBe("SGkh");
    expect(toBinaryString(b)).toBe("01001000 01101001 00100001");
    expect(toBase64(new Uint8Array(70000)).length).toBeGreaterThan(0);
  });
});

describe("detectFileType", () => {
  it.each([
    ["PNG", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]],
    ["JPEG", [0xff, 0xd8, 0xff, 0xe0]],
    ["GIF", Array.from("GIF89a", (c) => c.charCodeAt(0))],
    ["PDF", Array.from("%PDF-1.7", (c) => c.charCodeAt(0))],
    ["ZIP", [0x50, 0x4b, 0x03, 0x04, 0, 0]],
    ["gzip", [0x1f, 0x8b, 0x08]],
    ["ELF", [0x7f, 0x45, 0x4c, 0x46, 2]],
    ["Mach-O", [0xcf, 0xfa, 0xed, 0xfe]],
    ["PE / EXE", [0x4d, 0x5a, 0x90, 0x00]],
    ["MP3", [0x49, 0x44, 0x33, 4]],
    ["WebAssembly", [0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]],
    ["UTF-8 text (BOM)", [0xef, 0xbb, 0xbf, 0x41]],
    ["UTF-16 LE text (BOM)", [0xff, 0xfe, 0x41, 0x00]],
  ])("detects %s", (name, sig) => {
    expect(detectFileType(Uint8Array.from(sig))?.name).toBe(name);
  });

  it("detects WebP, MP4 and SQLite from offset signatures", () => {
    const webp = Uint8Array.from([...Array.from("RIFF", (c) => c.charCodeAt(0)), 0, 0, 0, 0, ...Array.from("WEBP", (c) => c.charCodeAt(0))]);
    expect(detectFileType(webp)?.name).toBe("WebP");
    const mp4 = Uint8Array.from([0, 0, 0, 0x18, ...Array.from("ftypisom", (c) => c.charCodeAt(0))]);
    expect(detectFileType(mp4)?.name).toBe("MP4");
    expect(detectFileType(bytesFromText("SQLite format 3\0", "utf-8"))?.name).toBe("SQLite");
  });

  it("falls back to text heuristics and null for unknown binary", () => {
    expect(detectFileType(bytesFromText("hello world\n", "utf-8"))?.name).toBe("Plain text");
    expect(detectFileType(bytesFromText('{"a":1}', "utf-8"))?.name).toBe("JSON (probably)");
    expect(detectFileType(bytesFromText("<?xml version=\"1.0\"?>", "utf-8"))?.name).toBe("XML");
    expect(detectFileType(bytes(0x01, 0x02, 0x03, 0x00, 0x99))).toBeNull();
    expect(detectFileType(new Uint8Array(0))).toBeNull();
  });
});

describe("byteStats", () => {
  it("computes entropy bounds and printable share", () => {
    const zeros = byteStats(new Uint8Array(100));
    expect(zeros.entropy).toBe(0);
    expect(zeros.nullCount).toBe(100);
    expect(zeros.printablePercent).toBe(0);
    const all = byteStats(Uint8Array.from({ length: 256 }, (_, i) => i));
    expect(all.entropy).toBe(8);
    expect(all.uniqueBytes).toBe(256);
    const text = byteStats(bytesFromText("hello", "utf-8"));
    expect(text.printablePercent).toBe(100);
    expect(text.entropy).toBeGreaterThan(1.5);
    expect(text.entropy).toBeLessThan(3);
    expect(byteStats(new Uint8Array(0))).toMatchObject({ size: 0, entropy: 0, printablePercent: 0 });
  });
});

describe("byteDetails", () => {
  it("describes ASCII and UTF-8 sequences", () => {
    const b = bytesFromText("Aé", "utf-8");
    expect(byteDetails(b, 0)).toMatchObject({ hex: "41", dec: 65, binary: "01000001", char: "A", utf8Char: "A" });
    expect(byteDetails(b, 1)).toMatchObject({ hex: "c3", utf8: "Lead byte of a 2-byte sequence", utf8Char: "é" });
    expect(byteDetails(b, 2)?.utf8).toMatch(/Continuation/);
    expect(byteDetails(b, 5)).toBeNull();
    expect(byteDetails(bytes(0x00), 0)?.char).toBe("\\x00");
  });
});
