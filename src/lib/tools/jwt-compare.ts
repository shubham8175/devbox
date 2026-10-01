import { decodeJwt, type JwtDecoded } from "@/lib/tools/jwt";
import type { JsonValue } from "@/lib/tools/json";

/** Upper bound on compared tokens, so a huge paste can't render hundreds of rows. */
export const MAX_JWT_COMPARE = 20;

/** Claims checked against the first valid token; a mismatch is listed as "differs from #N". */
export const JWT_IDENTITY_FIELDS = ["alg", "iss", "aud", "sub"] as const;
export type JwtIdentityField = (typeof JWT_IDENTITY_FIELDS)[number];

/**
 * Sample tokens: one already expired, one HS256 long-lived, one RS256 for another subject and audience.
 * Signatures are placeholders; nothing here is verified.
 */
export const JWT_COMPARE_SAMPLE = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzQyIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tIiwiYXVkIjoiYXBpIiwiaWF0IjoxNzM1Njg5NjAwLCJleHAiOjE3MzU2OTMyMDB9.c2lnbmF0dXJlLW5vdC12ZXJpZmllZA",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzQyIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tIiwiYXVkIjoiYXBpIiwiaWF0IjoxNzQwMDAwMDAwLCJuYmYiOjE3NDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMH0.c2lnbmF0dXJlLW5vdC12ZXJpZmllZA",
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImsxIn0.eyJzdWIiOiJzdmNfYmlsbGluZyIsImlzcyI6Imh0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSIsImF1ZCI6WyJhcGkiLCJiaWxsaW5nIl0sImlhdCI6MTc0MDAwMzYwMCwiZXhwIjo0MDcwOTA4ODAwfQ.c2lnbmF0dXJlLW5vdC12ZXJpZmllZA",
];

export interface JwtCompareRow {
  line: number;
  input: string;
  /** Display strings for the identity fields (aud arrays joined with ", "); null when absent. */
  fields: Record<JwtIdentityField, string | null>;
  /** Time claims as Dates; null when absent or not a number. */
  iat: Date | null;
  nbf: Date | null;
  exp: Date | null;
  /** exp − iat in ms, when both are present. */
  lifetime: number | null;
  /** exp − now in ms: positive = expires in, negative = expired ago. */
  untilExpiry: number | null;
  state: JwtDecoded["status"]["state"];
  /** Identity fields whose value differs from the reference (first valid) token. */
  differs: JwtIdentityField[];
}

export interface JwtCompareResult {
  rows: JwtCompareRow[];
  errors: Array<{ line: number; input: string; error: string }>;
  /** Field number of the token the others are compared against. */
  referenceLine: number | null;
  summary: {
    /** Earliest / latest exp among tokens that have one. */
    firstToExpire: JwtCompareRow | null;
    lastToExpire: JwtCompareRow | null;
    /** lastToExpire.exp − firstToExpire.exp, ≥ 0. */
    expiryGap: number | null;
    earliestIssued: JwtCompareRow | null;
    latestIssued: JwtCompareRow | null;
    /** latestIssued.iat − earliestIssued.iat, ≥ 0. */
    issuedApart: number | null;
    /** Tokens that differ from the reference in at least one identity field. */
    differing: number;
  } | null;
}

/** Strips a leading "Bearer " (any case). */
export function stripBearer(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, "");
}

/**
 * Pasting several tokens into one field: JWTs never contain whitespace or commas,
 * so split on those, dropping "Bearer" prefixes and surrounding quotes.
 */
export function splitJwtPaste(raw: string): string[] {
  return raw
    .replace(/\bBearer\s+/gi, " ")
    .split(/[\s,;]+/)
    .map((s) => s.replace(/^["'`]+|["'`]+$/g, ""))
    .filter(Boolean)
    .slice(0, MAX_JWT_COMPARE);
}

function claimText(v: JsonValue | undefined): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ");
  return JSON.stringify(v);
}

function claimDate(v: JsonValue | undefined): Date | null {
  return typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000) : null;
}

/** "sub user_42 · iss auth.example.com" — the short identity line shown under a token field. */
export function jwtShortIdentity(d: JwtDecoded): string {
  const sub = claimText(d.payload.sub);
  const iss = claimText(d.payload.iss);
  const parts = [sub && `sub ${sub}`, iss && `iss ${iss.replace(/^https?:\/\//, "").replace(/\/$/, "")}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "no sub / iss";
}

/** Decodes each non-empty field (no verification) and lines the tokens up against the first valid one. */
export function compareJwts(values: string[], now: Date = new Date()): JwtCompareResult {
  const rows: JwtCompareRow[] = [];
  const errors: JwtCompareResult["errors"] = [];

  values.forEach((raw, i) => {
    const input = stripBearer(raw);
    if (!input) return;
    const d = decodeJwt(input, now);
    if (!d.ok) {
      errors.push({ line: i + 1, input, error: d.error });
      return;
    }
    const iat = claimDate(d.payload.iat);
    const nbf = claimDate(d.payload.nbf);
    const exp = claimDate(d.payload.exp);
    rows.push({
      line: i + 1,
      input,
      fields: {
        alg: claimText(d.header.alg),
        iss: claimText(d.payload.iss),
        aud: claimText(d.payload.aud),
        sub: claimText(d.payload.sub),
      },
      iat,
      nbf,
      exp,
      lifetime: iat && exp ? exp.getTime() - iat.getTime() : null,
      untilExpiry: exp ? exp.getTime() - now.getTime() : null,
      state: d.status.state,
      differs: [],
    });
  });

  if (!rows.length) return { rows, errors, referenceLine: null, summary: null };

  const ref = rows[0];
  for (const r of rows.slice(1)) {
    r.differs = JWT_IDENTITY_FIELDS.filter((f) => r.fields[f] !== ref.fields[f]);
  }

  const extremes = (key: "iat" | "exp") => {
    const withClaim = rows.filter((r) => r[key]);
    if (!withClaim.length) return { min: null, max: null, gap: null };
    let min = withClaim[0];
    let max = withClaim[0];
    for (const r of withClaim) {
      if (r[key]! < min[key]!) min = r;
      if (r[key]! > max[key]!) max = r;
    }
    return { min, max, gap: max[key]!.getTime() - min[key]!.getTime() };
  };
  const e = extremes("exp");
  const issued = extremes("iat");

  return {
    rows,
    errors,
    referenceLine: ref.line,
    summary: {
      firstToExpire: e.min,
      lastToExpire: e.max,
      expiryGap: e.gap,
      earliestIssued: issued.min,
      latestIssued: issued.max,
      issuedApart: issued.gap,
      differing: rows.filter((r) => r.differs.length).length,
    },
  };
}
