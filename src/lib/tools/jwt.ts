import { formatISO, formatLocal, formatUTC, humanDuration } from "@/lib/tools/time";
import type { JsonValue } from "@/lib/tools/json";

export interface JwtTimeClaim {
  claim: "iat" | "exp" | "nbf";
  label: string;
  unix: number;
  local: string;
  utc: string;
  iso: string;
}

export interface JwtDecoded {
  ok: true;
  header: Record<string, JsonValue>;
  payload: Record<string, JsonValue>;
  signature: string;
  headerRaw: string;
  payloadRaw: string;
  timeClaims: JwtTimeClaim[];
  status: {
    state: "active" | "expired" | "not-yet-valid" | "no-expiry";
    message: string;
  };
}

export interface JwtError {
  ok: false;
  error: string;
}

function base64UrlDecode(segment: string): string {
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function parseSegment(segment: string, name: string): Record<string, JsonValue> {
  let text: string;
  try {
    text = base64UrlDecode(segment);
  } catch {
    throw new Error(`${name} is not valid Base64URL.`);
  }
  let value: JsonValue;
  try {
    value = JSON.parse(text) as JsonValue;
  } catch {
    throw new Error(`${name} is not valid JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object.`);
  }
  return value;
}

const CLAIM_LABELS: Record<JwtTimeClaim["claim"], string> = {
  iat: "Issued at",
  exp: "Expires at",
  nbf: "Not before",
};

/**
 * Decode a JWT locally. This never verifies the signature and never
 * transmits or stores the token.
 */
export function decodeJwt(raw: string, now: Date = new Date()): JwtDecoded | JwtError {
  const token = raw.trim().replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, error: "Paste a JWT to decode." };
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: `A JWT has 3 dot-separated parts (header.payload.signature); found ${parts.length}.` };
  }
  const [h, p, s] = parts;
  if (!/^[A-Za-z0-9_-]*$/.test(h) || !/^[A-Za-z0-9_-]*$/.test(p) || !/^[A-Za-z0-9_-]*$/.test(s)) {
    return { ok: false, error: "Token contains characters outside the Base64URL alphabet." };
  }
  let header: Record<string, JsonValue>;
  let payload: Record<string, JsonValue>;
  try {
    header = parseSegment(h, "Header");
    payload = parseSegment(p, "Payload");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not decode token." };
  }

  const timeClaims: JwtTimeClaim[] = [];
  for (const claim of ["iat", "nbf", "exp"] as const) {
    const v = payload[claim];
    if (typeof v === "number" && Number.isFinite(v)) {
      const date = new Date(v * 1000);
      timeClaims.push({
        claim,
        label: CLAIM_LABELS[claim],
        unix: v,
        local: formatLocal(date),
        utc: formatUTC(date),
        iso: formatISO(date),
      });
    }
  }

  const nowSec = now.getTime() / 1000;
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  const nbf = typeof payload.nbf === "number" ? payload.nbf : null;
  let status: JwtDecoded["status"];
  if (exp !== null && exp <= nowSec) {
    status = { state: "expired", message: `Expired ${humanDuration((nowSec - exp) * 1000)} ago` };
  } else if (nbf !== null && nbf > nowSec) {
    status = { state: "not-yet-valid", message: `Becomes valid in ${humanDuration((nbf - nowSec) * 1000)}` };
  } else if (exp !== null) {
    status = { state: "active", message: `Expires in ${humanDuration((exp - nowSec) * 1000)}` };
  } else {
    status = { state: "no-expiry", message: "No exp claim — token never expires" };
  }

  return {
    ok: true,
    header,
    payload,
    signature: s,
    headerRaw: JSON.stringify(header, null, 2),
    payloadRaw: JSON.stringify(payload, null, 2),
    timeClaims,
    status,
  };
}
