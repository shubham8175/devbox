export interface QueryParam {
  key: string;
  value: string;
}

export interface DeepLinkFields {
  scheme: string;
  host: string;
  path: string;
  params: QueryParam[];
  fragment: string;
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/i;

export function validateScheme(scheme: string): string | null {
  const s = scheme.trim();
  if (!s) return "Scheme is required (e.g. myapp or https).";
  if (!SCHEME_RE.test(s)) return "Scheme must start with a letter and contain only letters, digits, + . -";
  return null;
}

export function buildDeepLink(f: DeepLinkFields): string {
  const scheme = f.scheme.trim().replace(/:\/\/$/, "").replace(/:$/, "");
  const host = f.host.trim().replace(/^\/+|\/+$/g, "");
  let path = f.path.trim();
  if (path && !path.startsWith("/")) path = `/${path}`;
  path = path
    .split("/")
    .map((seg) => encodeURIComponent(decodeSafe(seg)))
    .join("/");
  const params = f.params.filter((p) => p.key.trim() !== "");
  const qs = params.map((p) => `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value)}`).join("&");
  const frag = f.fragment.trim() ? `#${encodeURIComponent(decodeSafe(f.fragment.trim()))}` : "";
  return `${scheme}://${host}${path}${qs ? `?${qs}` : ""}${frag}`;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Parse any scheme://host/path?query#fragment link (custom schemes are handled manually). */
export function parseDeepLink(raw: string): { ok: true; value: DeepLinkFields } | { ok: false; error: string } {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Paste a link to parse." };
  const m = /^([a-z][a-z0-9+.-]*):(?:\/\/)?([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(input);
  if (!m) return { ok: false, error: "That doesn't look like a link (expected scheme://host/path)." };
  const [, scheme, host, path, search, hash] = m;
  const params: QueryParam[] = [];
  if (search && search.length > 1) {
    for (const part of search.slice(1).split("&")) {
      if (!part) continue;
      const i = part.indexOf("=");
      const k = decodeSafe(i >= 0 ? part.slice(0, i) : part).replace(/\+/g, " ");
      const v = i >= 0 ? decodeSafe(part.slice(i + 1)).replace(/\+/g, " ") : "";
      params.push({ key: k, value: v });
    }
  }
  return {
    ok: true,
    value: {
      scheme: scheme.toLowerCase(),
      host: decodeSafe(host),
      path: decodeSafe(path),
      params,
      fragment: hash ? decodeSafe(hash.slice(1)) : "",
    },
  };
}

export const DEEP_LINK_EXAMPLES = ["myapp://device/123?source=qr", "https://example.com/app/item/42?ref=email#details", "tel:+919876543210", "spotify://track/4uLU6hMCjMI75M1A2tKUQC"];
