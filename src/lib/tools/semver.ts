import semver from "semver";

export interface ParsedVersion {
  raw: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<string | number>;
  build: string[];
}

export function parseVersion(input: string): ParsedVersion | null {
  const v = semver.parse(input.trim(), { loose: false });
  if (!v) return null;
  return {
    raw: v.raw,
    version: v.version,
    major: v.major,
    minor: v.minor,
    patch: v.patch,
    prerelease: [...v.prerelease],
    build: [...v.build],
  };
}

export function compareVersions(a: string, b: string): { ok: true; result: -1 | 0 | 1; diff: string | null } | { ok: false; error: string } {
  const va = semver.valid(a.trim());
  const vb = semver.valid(b.trim());
  if (!va) return { ok: false, error: `“${a.trim() || "(empty)"}” is not a valid semver version.` };
  if (!vb) return { ok: false, error: `“${b.trim() || "(empty)"}” is not a valid semver version.` };
  const result = semver.compare(va, vb);
  return { ok: true, result, diff: semver.diff(va, vb) };
}

export const BUMP_TYPES = ["major", "minor", "patch", "premajor", "preminor", "prepatch", "prerelease"] as const;
export type BumpType = (typeof BUMP_TYPES)[number];

export function bumpAll(version: string, identifier = "beta"): Record<BumpType, string> | null {
  if (!semver.valid(version.trim())) return null;
  const out = {} as Record<BumpType, string>;
  for (const t of BUMP_TYPES) {
    out[t] = semver.inc(version.trim(), t, identifier) ?? "";
  }
  return out;
}

export function sortVersions(list: string[], direction: "asc" | "desc"): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of list) {
    const v = raw.trim();
    if (!v) continue;
    if (semver.valid(v)) valid.push(v);
    else invalid.push(v);
  }
  const sorted = direction === "asc" ? semver.sort(valid) : semver.rsort(valid);
  return { valid: sorted, invalid };
}

export function satisfies(version: string, range: string): { ok: true; satisfies: boolean } | { ok: false; error: string } {
  if (!semver.valid(version.trim())) return { ok: false, error: "Version is not valid semver." };
  if (!semver.validRange(range.trim())) return { ok: false, error: "Range is not a valid semver range." };
  return { ok: true, satisfies: semver.satisfies(version.trim(), range.trim(), { includePrerelease: true }) };
}

export const OPERATORS: Array<{ op: string; example: string; meaning: string }> = [
  { op: "=", example: "1.2.3", meaning: "Exactly this version. Equals sign is optional." },
  { op: "^", example: "^1.2.3", meaning: "Allow changes that don't modify the left-most non-zero number: >=1.2.3 <2.0.0. For 0.x it's stricter (^0.2.3 → <0.3.0)." },
  { op: "~", example: "~1.2.3", meaning: "Allow patch-level changes if a minor is given: >=1.2.3 <1.3.0." },
  { op: ">", example: ">1.2.3", meaning: "Any version strictly greater than 1.2.3." },
  { op: ">=", example: ">=1.2.3", meaning: "1.2.3 or any higher version." },
  { op: "<", example: "<2.0.0", meaning: "Any version strictly lower than 2.0.0." },
  { op: "<=", example: "<=1.9.9", meaning: "1.9.9 or any lower version." },
  { op: "x / *", example: "1.2.x", meaning: "Wildcard: any patch of 1.2. `1.x` is any minor/patch of 1, `*` is anything." },
  { op: "-", example: "1.2.3 - 2.3.4", meaning: "Inclusive range: >=1.2.3 <=2.3.4." },
  { op: "space", example: ">=1.2.0 <2.0.0", meaning: "AND: both comparators must be satisfied." },
  { op: "||", example: "^1.0.0 || ^2.0.0", meaning: "OR: either side may be satisfied." },
];

export const PRERELEASE_EXAMPLES: Array<{ version: string; note: string }> = [
  { version: "1.0.0-alpha", note: "Alpha prerelease — sorts before 1.0.0" },
  { version: "1.0.0-alpha.1", note: "Numeric identifiers compare numerically" },
  { version: "1.0.0-beta.2", note: "beta > alpha (identifiers compare ASCII-wise)" },
  { version: "1.0.0-rc.1", note: "Release candidate" },
  { version: "1.0.0", note: "Final release — higher than any prerelease of 1.0.0" },
  { version: "1.0.0+build.42", note: "Build metadata is ignored when comparing" },
];
