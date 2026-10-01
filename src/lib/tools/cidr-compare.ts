import { ipToString, maskFromPrefix, parseCidr, parseIPv4, prefixFromMask, type CidrInfo } from "@/lib/tools/ip";

/** Upper bound on compared ranges, so a huge paste can't render thousands of pairs. */
export const MAX_CIDR_COMPARE = 50;

/** A VPC with a few subnets: one nested twice, one outside the VPC entirely. */
export const CIDR_COMPARE_SAMPLE = ["10.0.0.0/16", "10.0.1.0/24", "10.0.2.0/24", "10.0.1.128/25", "192.168.0.0/24"];

/** One field after parsing. `start`/`end` are inclusive unsigned 32-bit addresses. */
export type CidrEntry =
  | { line: number; input: string; ok: true; info: CidrInfo; cidr: string; start: number; end: number; size: number; normalizedFrom: string | null }
  | { line: number; input: string; ok: false; error: string };

export type ValidCidrEntry = Extract<CidrEntry, { ok: true }>;

export type CidrRelation = "identical" | "a-contains-b" | "b-contains-a" | "overlaps" | "adjacent" | "disjoint";

export interface CidrPair {
  a: ValidCidrEntry;
  b: ValidCidrEntry;
  relation: CidrRelation;
  /** Addresses both ranges share (0 for adjacent/disjoint). */
  shared: number;
  /** For adjacent pairs of equal size whose lower half is aligned: the CIDR they merge into. */
  mergesInto: string | null;
  /** Plain-English description, e.g. "#2 10.0.1.0/24 is inside #1 10.0.0.0/16". */
  text: string;
}

export interface CidrCompareResult {
  entries: CidrEntry[];
  valid: ValidCidrEntry[];
  pairs: CidrPair[];
  /** Pairs that share addresses: identical, containment or partial overlap. */
  conflicts: CidrPair[];
  adjacent: CidrPair[];
  /** Unique addresses covered by all ranges together (no double counting). */
  unionSize: number;
  /** Smallest single CIDR covering every range, or null with no valid input. */
  supernet: { cidr: string; size: number } | null;
  /** Minimal CIDR list covering exactly the union. */
  collapsed: string[];
}

/** Parses one field. A bare IP is a /32; a host address like 10.0.0.5/24 is normalised to its network. */
export function parseCidrEntry(raw: string, line: number): CidrEntry {
  const input = raw.trim();
  const r = parseCidr(input);
  if (!r.ok) return { line, input, ok: false, error: r.error };
  const info = r.value;
  const cidr = `${info.network}/${info.prefix}`;
  return {
    line,
    input,
    ok: true,
    info,
    cidr,
    start: info.networkInt,
    end: info.broadcastInt,
    size: info.totalAddresses,
    normalizedFrom: info.address !== info.network ? input : null,
  };
}

/** Field values → entries numbered by field (#1 = first box), skipping empty fields. */
export function toCidrEntries(values: string[]): CidrEntry[] {
  return values.flatMap((v, i) => (v.trim() ? [parseCidrEntry(v, i + 1)] : []));
}

/**
 * Pasting a list into one field: split on newlines, commas, semicolons or whitespace,
 * but keep "10.0.0.0 255.255.255.0" (address + dotted mask) together as one value.
 */
export function splitCidrPaste(raw: string): string[] {
  const tokens = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    const isMask = !t.includes("/") && parseIPv4(t) !== null && prefixFromMask(parseIPv4(t)!) !== null;
    if (prev !== undefined && isMask && !prev.includes("/") && !prev.includes(" ")) out[out.length - 1] = `${prev} ${t}`;
    else out.push(t);
  }
  return out.slice(0, MAX_CIDR_COMPARE);
}

const label = (e: ValidCidrEntry) => `#${e.line} ${e.cidr}`;

/** Largest aligned CIDR prefix that starts at `start` and fits within [start, end]. */
function blockPrefixAt(start: number, end: number): number {
  let prefix = 32;
  while (prefix > 0) {
    const size = 2 ** (33 - prefix);
    if (start % size !== 0 || start + size - 1 > end) break;
    prefix--;
  }
  return prefix;
}

/** Splits an inclusive address range into the fewest CIDR blocks. */
export function rangeToCidrs(start: number, end: number): string[] {
  const out: string[] = [];
  let s = start;
  while (s <= end) {
    const prefix = blockPrefixAt(s, end);
    out.push(`${ipToString(s)}/${prefix}`);
    s += 2 ** (32 - prefix);
  }
  return out;
}

export function relate(a: ValidCidrEntry, b: ValidCidrEntry): CidrPair {
  const shared = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start) + 1);
  let relation: CidrRelation;
  let mergesInto: string | null = null;
  let text: string;
  if (a.start === b.start && a.end === b.end) {
    relation = "identical";
    text = `${label(b)} is the same range as ${label(a)}`;
  } else if (a.start <= b.start && b.end <= a.end) {
    relation = "a-contains-b";
    text = `${label(b)} is inside ${label(a)}`;
  } else if (b.start <= a.start && a.end <= b.end) {
    relation = "b-contains-a";
    text = `${label(a)} is inside ${label(b)}`;
  } else if (shared > 0) {
    // Unreachable for normalised CIDRs (blocks nest or don't touch), kept so the logic holds for any range.
    relation = "overlaps";
    text = `${label(a)} and ${label(b)} overlap (${shared.toLocaleString()} shared addresses)`;
  } else if (a.end + 1 === b.start || b.end + 1 === a.start) {
    relation = "adjacent";
    const [lo, hi] = a.start < b.start ? [a, b] : [b, a];
    if (lo.size === hi.size && lo.info.prefix > 0 && lo.start % (lo.size * 2) === 0) {
      mergesInto = `${lo.info.network}/${lo.info.prefix - 1}`;
    }
    text = `${label(hi)} starts right after ${label(lo)} ends${mergesInto ? ` — together they form ${mergesInto}` : ""}`;
  } else {
    relation = "disjoint";
    text = `${label(a)} and ${label(b)} don't overlap`;
  }
  return { a, b, relation, shared, mergesInto, text };
}

/** Smallest CIDR containing both addresses. */
function coveringCidr(start: number, end: number): { cidr: string; size: number } {
  let prefix = 32;
  while (prefix > 0 && (start & maskFromPrefix(prefix)) >>> 0 !== (end & maskFromPrefix(prefix)) >>> 0) prefix--;
  const network = (start & maskFromPrefix(prefix)) >>> 0;
  return { cidr: `${ipToString(network)}/${prefix}`, size: 2 ** (32 - prefix) };
}

export function compareCidrs(entries: CidrEntry[]): CidrCompareResult {
  const valid = entries.filter((e): e is ValidCidrEntry => e.ok);
  const pairs: CidrPair[] = [];
  for (let i = 0; i < valid.length; i++) for (let j = i + 1; j < valid.length; j++) pairs.push(relate(valid[i], valid[j]));

  // Merge sorted ranges (touching ones too) into the union.
  const merged: Array<[number, number]> = [];
  for (const e of [...valid].sort((x, y) => x.start - y.start || y.end - x.end)) {
    const last = merged[merged.length - 1];
    if (last && e.start <= last[1] + 1) last[1] = Math.max(last[1], e.end);
    else merged.push([e.start, e.end]);
  }

  return {
    entries,
    valid,
    pairs,
    conflicts: pairs.filter((p) => p.shared > 0),
    // Neighbours both nested inside another listed range are noise: that range already covers them.
    adjacent: pairs.filter(
      (p) =>
        p.relation === "adjacent" &&
        !valid.some((c) => c !== p.a && c !== p.b && c.start <= Math.min(p.a.start, p.b.start) && Math.max(p.a.end, p.b.end) <= c.end),
    ),
    unionSize: merged.reduce((n, [s, e]) => n + (e - s + 1), 0),
    supernet: valid.length ? coveringCidr(Math.min(...valid.map((e) => e.start)), Math.max(...valid.map((e) => e.end))) : null,
    collapsed: merged.flatMap(([s, e]) => rangeToCidrs(s, e)),
  };
}
