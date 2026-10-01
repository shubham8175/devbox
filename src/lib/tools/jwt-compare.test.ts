import { describe, expect, it } from "vitest";
import { compareJwts, JWT_COMPARE_SAMPLE, splitJwtPaste, stripBearer } from "@/lib/tools/jwt-compare";

const NOW = new Date("2026-01-01T00:00:00Z");
const [EXPIRED, LONG, RS256] = JWT_COMPARE_SAMPLE;

describe("jwt compare", () => {
  it("decodes the sample and lines up time claims", () => {
    const r = compareJwts(JWT_COMPARE_SAMPLE, NOW);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.state)).toEqual(["expired", "active", "active"]);
    expect(r.rows[0].lifetime).toBe(3_600_000);
    expect(r.rows[0].untilExpiry).toBeLessThan(0);
    expect(r.rows[1].nbf?.toISOString()).toBe("2025-02-19T21:20:00.000Z");
    expect(r.rows[1].untilExpiry).toBeGreaterThan(0);
  });

  it("summarises first/last to expire and issued-apart", () => {
    const s = compareJwts(JWT_COMPARE_SAMPLE, NOW).summary!;
    expect(s.firstToExpire?.line).toBe(1);
    expect(s.lastToExpire?.line).toBe(2);
    expect(s.expiryGap).toBe((4102444800 - 1735693200) * 1000);
    expect(s.earliestIssued?.line).toBe(1);
    expect(s.latestIssued?.line).toBe(3);
    expect(s.issuedApart).toBe((1740003600 - 1735689600) * 1000);
  });

  it("flags alg/iss/aud/sub that differ from the first valid token", () => {
    const r = compareJwts(JWT_COMPARE_SAMPLE, NOW);
    expect(r.referenceLine).toBe(1);
    expect(r.rows[1].differs).toEqual([]);
    expect(r.rows[2].differs).toEqual(["alg", "aud", "sub"]);
    expect(r.rows[2].fields.aud).toBe("api, billing");
    expect(r.summary?.differing).toBe(1);
  });

  it("skips empty fields, keeps field numbers, reports bad tokens and uses the first valid token as reference", () => {
    const r = compareJwts(["not.a.jwt", "", `Bearer ${RS256}`, LONG], NOW);
    expect(r.errors.map((e) => e.line)).toEqual([1]);
    expect(r.rows.map((x) => x.line)).toEqual([3, 4]);
    expect(r.referenceLine).toBe(3);
    expect(r.rows[1].differs).toEqual(["alg", "aud", "sub"]);
  });

  it("handles a single token and no tokens", () => {
    expect(compareJwts(["", " "], NOW)).toEqual({ rows: [], errors: [], referenceLine: null, summary: null });
    expect(compareJwts([EXPIRED], NOW).summary?.issuedApart).toBe(0);
  });

  it("splits pasted lists on whitespace and commas, dropping Bearer and quotes", () => {
    expect(splitJwtPaste(`Bearer ${EXPIRED}\n"${LONG}",  ${RS256}`)).toEqual([EXPIRED, LONG, RS256]);
    expect(stripBearer(`  bearer ${LONG} `)).toBe(LONG);
  });
});
