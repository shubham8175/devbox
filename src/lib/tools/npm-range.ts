import semver from "semver";

export interface RangeExplanation {
  ok: true;
  input: string;
  normalized: string;
  kind: string;
  summary: string;
  details: string[];
  minVersion: string | null;
  allowed: string[];
  disallowed: string[];
}

export interface RangeError {
  ok: false;
  error: string;
}

function v(major: number, minor: number, patch: number): string {
  return `${Math.max(0, major)}.${Math.max(0, minor)}.${Math.max(0, patch)}`;
}

function candidates(base: semver.SemVer | null): string[] {
  if (!base) return ["0.0.1", "0.1.0", "1.0.0", "1.2.3", "2.0.0", "10.0.0"];
  const { major, minor, patch } = base;
  const list = [
    v(major, minor, patch),
    v(major, minor, patch + 1),
    v(major, minor + 1, 0),
    v(major + 1, 0, 0),
    v(major, minor, Math.max(0, patch - 1)),
    v(Math.max(0, major - 1), 9, 9),
    v(major, minor + 2, 5),
    v(major + 2, 0, 0),
    `${v(major + 1, 0, 0)}-beta.1`,
  ];
  return Array.from(new Set(list));
}

function describeSimple(range: string): { kind: string; summary: string; details: string[] } {
  const r = range.trim();
  const plain = r.replace(/^v/, "");
  const exact = semver.valid(plain);
  if (exact) {
    return {
      kind: "Exact version",
      summary: `Only version ${exact} is allowed. Nothing else, not even a patch release.`,
      details: ["Use this when you need a reproducible install without a lockfile, or to pin a known-good build."],
    };
  }
  const caret = /^\^\s*v?(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(-[\w.-]+)?$/.exec(r);
  if (caret) {
    const [, ma, mi, pa] = caret;
    const major = Number(ma);
    const minor = mi === undefined || mi === "x" || mi === "*" ? 0 : Number(mi);
    const patch = pa === undefined || pa === "x" || pa === "*" ? 0 : Number(pa);
    if (major > 0) {
      return {
        kind: "Caret range",
        summary: `Any ${major}.x.x version at or above ${major}.${minor}.${patch}. Minor and patch updates are allowed; a new major is not.`,
        details: [`Equivalent to >=${major}.${minor}.${patch} <${major + 1}.0.0.`, "Caret keeps the left-most non-zero number fixed, so this trusts the package to follow semver for backwards-compatible changes.", "This is what `npm install <pkg>` writes by default."],
      };
    }
    if (minor > 0) {
      return {
        kind: "Caret range (0.x)",
        summary: `Only patch updates: 0.${minor}.${patch} up to but not including 0.${minor + 1}.0.`,
        details: [`Equivalent to >=0.${minor}.${patch} <0.${minor + 1}.0.`, "For 0.x packages the minor number is treated as the breaking-change number, so caret becomes patch-only."],
      };
    }
    return {
      kind: "Caret range (0.0.x)",
      summary: `Exactly 0.0.${patch}. No updates are allowed because 0.0.x versions are considered unstable.`,
      details: [`Equivalent to >=0.0.${patch} <0.0.${patch + 1}.`],
    };
  }
  const tilde = /^~\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(-[\w.-]+)?$/.exec(r);
  if (tilde) {
    const [, ma, mi, pa] = tilde;
    const major = Number(ma);
    if (mi === undefined) {
      return { kind: "Tilde range", summary: `Any ${major}.x.x version.`, details: [`With only a major given, tilde behaves like ^${major}: >=${major}.0.0 <${major + 1}.0.0.`] };
    }
    const minor = Number(mi);
    const patch = pa === undefined ? 0 : Number(pa);
    return {
      kind: "Tilde range",
      summary: `Patch updates only: ${major}.${minor}.${patch} up to but not including ${major}.${minor + 1}.0.`,
      details: [`Equivalent to >=${major}.${minor}.${patch} <${major}.${minor + 1}.0.`, "Tilde is more conservative than caret: new minor versions are never pulled in."],
    };
  }
  if (/^(\*|x|X)$/.test(r) || r === "") {
    return { kind: "Wildcard", summary: "Any version at all is allowed, including breaking majors.", details: ["Equivalent to >=0.0.0. Avoid in production dependencies."] };
  }
  const xr = /^v?(\d+)(?:\.(\d+|x|X|\*))?(?:\.(x|X|\*))?$/.exec(r);
  if (xr) {
    const [, ma, mi] = xr;
    const major = Number(ma);
    if (mi === undefined || /^[xX*]$/.test(mi)) {
      return { kind: "X-range", summary: `Any ${major}.x.x version.`, details: [`Equivalent to >=${major}.0.0 <${major + 1}.0.0. Same as ^${major}.0.0.`] };
    }
    const minor = Number(mi);
    return { kind: "X-range", summary: `Any ${major}.${minor}.x patch version.`, details: [`Equivalent to >=${major}.${minor}.0 <${major}.${minor + 1}.0. Same as ~${major}.${minor}.0.`] };
  }
  const hyphen = /^v?([\w.-]+)\s+-\s+v?([\w.-]+)$/.exec(r);
  if (hyphen) {
    return {
      kind: "Hyphen range",
      summary: `Any version from ${hyphen[1]} through ${hyphen[2]}, inclusive on both ends.`,
      details: ["A partial upper bound (e.g. 2.3) means “anything below the next minor/major”."],
    };
  }
  const comparator = /^(>=|<=|>|<)\s*v?([\w.-]+)$/.exec(r);
  if (comparator) {
    const [, op, ver] = comparator;
    const text: Record<string, string> = {
      ">": `Any version strictly greater than ${ver}.`,
      ">=": `${ver} or any newer version, with no upper limit.`,
      "<": `Any version strictly lower than ${ver}.`,
      "<=": `${ver} or any older version.`,
    };
    return { kind: "Comparator", summary: text[op], details: [op.startsWith(">") ? "There is no upper bound, so future breaking majors would be accepted." : "There is no lower bound."] };
  }
  const parts = r.split(/\s+/);
  if (parts.length > 1) {
    const explained = parts.map((p) => describeSimple(p).summary);
    return {
      kind: "Compound range (AND)",
      summary: "All of these conditions must hold at the same time:",
      details: explained,
    };
  }
  return { kind: "Range", summary: `Versions matching ${r}.`, details: [] };
}

export function explainRange(input: string): RangeExplanation | RangeError {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Enter a version range like ^5.2.1." };
  const normalized = semver.validRange(raw, { includePrerelease: true });
  if (normalized === null) return { ok: false, error: `“${raw}” is not a valid npm version range.` };

  const orParts = raw.split(/\s*\|\|\s*/);
  let kind: string;
  let summary: string;
  let details: string[];
  if (orParts.length > 1) {
    kind = "Compound range (OR)";
    summary = "A version is allowed if it matches any one of these alternatives:";
    details = orParts.map((p) => `${p.trim()} — ${describeSimple(p).summary}`);
  } else {
    ({ kind, summary, details } = describeSimple(raw));
  }

  let minVersion: string | null = null;
  try {
    minVersion = semver.minVersion(raw)?.version ?? null;
  } catch {
    minVersion = null;
  }
  const base = minVersion ? semver.parse(minVersion) : null;
  const allowed: string[] = [];
  const disallowed: string[] = [];
  for (const c of candidates(base)) {
    if (semver.satisfies(c, raw, { includePrerelease: false })) allowed.push(c);
    else disallowed.push(c);
  }
  return { ok: true, input: raw, normalized, kind, summary, details, minVersion, allowed: allowed.slice(0, 6), disallowed: disallowed.slice(0, 6) };
}

export const RANGE_EXAMPLES = ["^5.2.1", "~1.4.0", "^0.3.2", "1.2.x", "*", ">=1.2.0 <2.0.0", "1.2.3 - 2.3.4", "^1.0.0 || ^2.0.0", "18.2.0"];
