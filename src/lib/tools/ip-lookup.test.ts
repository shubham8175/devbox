import { describe, expect, it } from "vitest";
import {
  LookupError,
  detectPublicIp,
  describeSpecialIpv6,
  flagEmoji,
  formatIPv6,
  formatOffset,
  lookupIp,
  normalizeIpinfo,
  normalizeIpwhois,
  parseIp,
  specialLabel,
  zoneOffset,
} from "./ip-lookup";

// ---------- Parsing ----------

describe("parseIp", () => {
  it("parses IPv4", () => {
    expect(parseIp(" 8.8.8.8 ")).toMatchObject({ ok: true, value: { family: 4, n: 0x08080808, text: "8.8.8.8" } });
  });

  it("rejects bad IPv4 and CIDR input", () => {
    expect(parseIp("256.1.1.1").ok).toBe(false);
    expect(parseIp("1.2.3").ok).toBe(false);
    expect(parseIp("10.0.0.0/8")).toMatchObject({ ok: false, error: expect.stringContaining("/prefix") });
    expect(parseIp("").ok).toBe(false);
  });

  it("parses and canonicalises IPv6", () => {
    expect(parseIp("2001:0DB8:0000:0000:0000:0000:0000:0001")).toMatchObject({ ok: true, value: { family: 6, text: "2001:db8::1" } });
    expect(parseIp("[::1]")).toMatchObject({ ok: true, value: { text: "::1" } });
    expect(parseIp("fe80::1%en0")).toMatchObject({ ok: true, value: { text: "fe80::1" } });
    expect(parseIp("1:2:3:4:5:6:7:8")).toMatchObject({ ok: true, value: { text: "1:2:3:4:5:6:7:8" } });
    expect(parseIp("::")).toMatchObject({ ok: true, value: { text: "::" } });
    expect(parseIp("::ffff:192.0.2.128")).toMatchObject({ ok: true, value: { text: "::ffff:192.0.2.128" } });
    expect(parseIp("::ffff:c000:0280")).toMatchObject({ ok: true, value: { text: "::ffff:192.0.2.128" } });
    expect(parseIp("::1.2.3.4")).toMatchObject({ ok: true, value: { text: "::102:304" } });
  });

  it("rejects malformed IPv6", () => {
    for (const bad of ["1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "1::2::3", ":::", "12345::", "g::1", "::ffff:1.2.3"]) {
      expect(parseIp(bad).ok, bad).toBe(false);
    }
  });
});

describe("formatIPv6", () => {
  it("compresses only the longest zero run", () => {
    expect(formatIPv6([0x2001, 0xdb8, 0, 1, 0, 0, 0, 1])).toBe("2001:db8:0:1::1");
    expect(formatIPv6([0x2001, 0xdb8, 0, 0, 1, 0, 0, 1])).toBe("2001:db8::1:0:0:1");
    expect(formatIPv6([1, 0, 2, 0, 3, 0, 4, 0])).toBe("1:0:2:0:3:0:4:0");
  });
});

describe("special addresses", () => {
  const label = (text: string) => {
    const r = parseIp(text);
    if (!r.ok) throw new Error(text);
    return specialLabel(r.value);
  };
  it("labels reserved ranges in both families", () => {
    expect(label("192.168.1.4")).toBe("Private (RFC 1918)");
    expect(label("127.0.0.1")).toBe("Loopback");
    expect(label("100.64.1.1")).toContain("Carrier-grade NAT");
    expect(label("8.8.8.8")).toBeNull();
    expect(label("::1")).toBe("Loopback");
    expect(label("::")).toBe("Unspecified address");
    expect(label("fe80::1")).toContain("Link-local");
    expect(label("febf::1")).toContain("Link-local");
    expect(label("fec0::1")).toBeNull();
    expect(label("fd12:3456::1")).toContain("Unique local");
    expect(label("ff02::1")).toContain("Multicast");
    expect(label("2001:db8::1")).toContain("Documentation");
    expect(label("100::1")).toContain("Discard");
    expect(label("::ffff:10.0.0.1")).toContain("Private");
    expect(label("::ffff:8.8.8.8")).toBeNull();
    expect(label("2606:4700::1111")).toBeNull();
    expect(describeSpecialIpv6([0x2001, 0, 0, 0, 0, 0, 0, 1])).toBeNull();
  });
});

// ---------- Normalisation ----------

const IPWHOIS = {
  ip: "8.8.8.8",
  success: true,
  type: "IPv4",
  continent: "North America",
  continent_code: "NA",
  country: "United States",
  country_code: "US",
  region: "California",
  region_code: "CA",
  city: "San Jose",
  latitude: 37.3393939,
  longitude: -121.8949553,
  is_eu: false,
  postal: "95025",
  calling_code: "1",
  capital: "Washington D.C.",
  flag: { emoji: "🇺🇸" },
  connection: { asn: 15169, org: "Google LLC", isp: "Google LLC", domain: "google.com" },
  timezone: { id: "America/Los_Angeles", abbr: "PDT", is_dst: true, offset: -25200, utc: "-07:00" },
};

const IPINFO = {
  ip: "8.8.8.8",
  hostname: "dns.google",
  city: "Mountain View",
  region: "California",
  country: "US",
  loc: "38.0088,-122.1175",
  org: "AS15169 Google LLC",
  postal: "94043",
  timezone: "America/Los_Angeles",
  anycast: true,
};

describe("normalizers", () => {
  it("maps ipwho.is", () => {
    expect(normalizeIpwhois(IPWHOIS)).toMatchObject({
      ip: "8.8.8.8",
      version: 4,
      countryCode: "US",
      country: "United States",
      flag: "🇺🇸",
      continent: "North America",
      region: "California",
      city: "San Jose",
      postal: "95025",
      latitude: 37.3393939,
      timezone: "America/Los_Angeles",
      utcOffset: "-07:00",
      isp: "Google LLC",
      asn: "AS15169",
      domain: "google.com",
      callingCode: "+1",
      isEu: false,
      source: "ipwho.is",
    });
  });

  it("maps ipinfo.io and splits the AS from the org", () => {
    const d = normalizeIpinfo(IPINFO);
    expect(d).toMatchObject({
      ip: "8.8.8.8",
      countryCode: "US",
      country: "United States",
      flag: "🇺🇸",
      city: "Mountain View",
      latitude: 38.0088,
      longitude: -122.1175,
      asn: "AS15169",
      org: "Google LLC",
      hostname: "dns.google",
      anycast: true,
      source: "ipinfo.io",
    });
    expect(d.utcOffset).toMatch(/^-0[78]:00$/);
  });

  it("tolerates missing fields", () => {
    const d = normalizeIpwhois({ ip: "2001:4860:4860::8888", success: true });
    expect(d.version).toBe(6);
    expect(d.country).toBeNull();
    expect(d.asn).toBeNull();
  });
});

// ---------- Fetch orchestration ----------

function fakeFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL) => Promise.resolve(handler(String(input)))) as typeof fetch;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("lookupIp", () => {
  it("uses ipwho.is when it answers", async () => {
    const calls: string[] = [];
    const d = await lookupIp("8.8.8.8", fakeFetch((u) => (calls.push(u), json(IPWHOIS))));
    expect(d.source).toBe("ipwho.is");
    expect(calls).toEqual(["https://ipwho.is/8.8.8.8"]);
  });

  it("falls back to ipinfo.io on a rate limit or a failed answer", async () => {
    const d = await lookupIp("8.8.8.8", fakeFetch((u) => (u.includes("ipwho.is") ? json({ success: false, message: "quota" }) : json(IPINFO))));
    expect(d.source).toBe("ipinfo.io");
    const d2 = await lookupIp("8.8.8.8", fakeFetch((u) => (u.includes("ipwho.is") ? json({}, 429) : json(IPINFO))));
    expect(d2.source).toBe("ipinfo.io");
  });

  it("reports both failures", async () => {
    const err = await lookupIp("8.8.8.8", fakeFetch((u) => (u.includes("ipwho.is") ? json({}, 500) : json({ bogon: true })))).catch((e) => e);
    expect(err).toBeInstanceOf(LookupError);
    expect((err as LookupError).attempts).toEqual([
      { service: "ipwho.is", reason: "HTTP 500" },
      { service: "ipinfo.io", reason: "reserved address" },
    ]);
  });
});

describe("detectPublicIp", () => {
  it("returns both families and ignores an IPv4 answer from api64", async () => {
    const r = await detectPublicIp(fakeFetch((u) => json({ ip: u.includes("api64") ? "2401:4900::1" : "203.0.113.9" })));
    expect(r).toEqual({ ipv4: "203.0.113.9", ipv6: "2401:4900::1" });
    const r2 = await detectPublicIp(fakeFetch(() => json({ ip: "203.0.113.9" })));
    expect(r2).toEqual({ ipv4: "203.0.113.9", ipv6: null });
  });

  it("throws when nothing answers", async () => {
    await expect(detectPublicIp(fakeFetch(() => json({}, 503)))).rejects.toThrow(/ipify/);
  });
});

describe("helpers", () => {
  it("formats offsets, flags and zone offsets", () => {
    expect(formatOffset(19800)).toBe("+05:30");
    expect(formatOffset(-25200)).toBe("-07:00");
    expect(formatOffset(0)).toBe("+00:00");
    expect(flagEmoji("in")).toBe("🇮🇳");
    expect(flagEmoji("x")).toBeNull();
    expect(zoneOffset("Asia/Kolkata")).toBe("+05:30");
    expect(zoneOffset("Etc/UTC")).toBe("+00:00");
    expect(zoneOffset("Not/AZone")).toBeNull();
  });
});
