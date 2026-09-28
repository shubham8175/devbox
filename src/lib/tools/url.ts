export interface CodecResult {
  ok: boolean;
  output: string;
  error?: string;
}

export function encodeComponent(text: string): CodecResult {
  try {
    return { ok: true, output: encodeURIComponent(text) };
  } catch (e) {
    return { ok: false, output: "", error: e instanceof Error ? e.message : "Could not encode." };
  }
}

export function decodeComponent(text: string): CodecResult {
  try {
    return { ok: true, output: decodeURIComponent(text.replace(/\+/g, "%20")) };
  } catch {
    return { ok: false, output: "", error: "Malformed percent-encoding. Check for stray % characters." };
  }
}

export interface ParsedUrl {
  ok: true;
  href: string;
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  params: Array<{ key: string; value: string }>;
}

export interface ParsedUrlError {
  ok: false;
  error: string;
}

export function parseUrl(raw: string): ParsedUrl | ParsedUrlError {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Enter a URL to parse." };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    // Be forgiving about missing scheme
    try {
      url = new URL(`https://${input}`);
    } catch {
      return { ok: false, error: "That doesn't look like a valid URL." };
    }
  }
  const params: Array<{ key: string; value: string }> = [];
  url.searchParams.forEach((value, key) => params.push({ key, value }));
  return {
    ok: true,
    href: url.href,
    protocol: url.protocol,
    username: url.username,
    password: url.password,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    origin: url.origin,
    params,
  };
}
