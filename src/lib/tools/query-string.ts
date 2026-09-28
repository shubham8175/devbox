export interface QueryParam {
  id: number;
  key: string;
  value: string;
}

export interface ParsedTarget {
  base: string;
  params: Array<{ key: string; value: string }>;
  hash: string;
}

/** Split a URL into base (without query/hash), decoded params and hash. Tolerates bare query strings. */
export function parseTarget(input: string): ParsedTarget {
  let s = input.trim();
  let hash = "";
  const hi = s.indexOf("#");
  if (hi >= 0) {
    hash = s.slice(hi);
    s = s.slice(0, hi);
  }
  const qi = s.indexOf("?");
  let base = s;
  let query = "";
  if (qi >= 0) {
    base = s.slice(0, qi);
    query = s.slice(qi + 1);
  } else if (/^[^=&/:\s]+=|&/.test(s) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    base = "";
    query = s;
  }
  const params = new URLSearchParams(query);
  const list: Array<{ key: string; value: string }> = [];
  params.forEach((value, key) => list.push({ key, value }));
  return { base, params: list, hash };
}

export function buildUrl(base: string, params: Array<{ key: string; value: string }>, hash: string, spaces: "percent" | "plus" = "percent"): string {
  const enc = (s: string) => (spaces === "plus" ? encodeURIComponent(s).replace(/%20/g, "+") : encodeURIComponent(s));
  const qs = params
    .filter((p) => p.key !== "")
    .map((p) => `${enc(p.key)}=${enc(p.value)}`)
    .join("&");
  const b = base.trim();
  let h = hash.trim();
  if (h && !h.startsWith("#")) h = `#${h}`;
  return `${b}${qs ? `?${qs}` : ""}${h}`;
}

export function isValidBase(base: string): boolean {
  if (!base.trim()) return true;
  try {
    new URL(base);
    return true;
  } catch {
    return /^\//.test(base.trim()) || /^[\w.-]+(:\d+)?(\/.*)?$/.test(base.trim());
  }
}
