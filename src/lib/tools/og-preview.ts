export interface OgFields {
  title: string;
  description: string;
  url: string;
  siteName: string;
}

export const OG_LIMITS = {
  title: 70,
  description: 200,
};

export function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Bare host for the little domain label shown on cards. */
export function displayHost(url: string): string {
  const u = url.trim();
  if (!u) return "";
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`).host.replace(/^www\./, "");
  } catch {
    return u.replace(/^https?:\/\//, "").split("/")[0];
  }
}

/** Only allow http(s) for remote image loads. */
export function isSafeRemoteUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ogTagsFor(f: OgFields, imageUrl: string): string {
  const lines: string[] = [];
  if (f.title.trim()) lines.push(`<meta property="og:title" content="${esc(f.title.trim())}">`);
  if (f.description.trim()) lines.push(`<meta property="og:description" content="${esc(f.description.trim())}">`);
  if (f.url.trim()) lines.push(`<meta property="og:url" content="${esc(f.url.trim())}">`);
  if (f.siteName.trim()) lines.push(`<meta property="og:site_name" content="${esc(f.siteName.trim())}">`);
  if (imageUrl.trim()) lines.push(`<meta property="og:image" content="${esc(imageUrl.trim())}">`);
  lines.push(`<meta name="twitter:card" content="summary_large_image">`);
  return lines.join("\n");
}
