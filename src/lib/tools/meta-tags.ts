export interface MetaFields {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  themeColor: string;
  ogType: string;
  ogUrl: string;
  ogImage: string;
  ogSiteName: string;
  twitterCard: string;
  twitterSite: string;
}

export const ROBOTS_OPTIONS = [
  { value: "index, follow", label: "index, follow (default)" },
  { value: "noindex, follow", label: "noindex, follow" },
  { value: "index, nofollow", label: "index, nofollow" },
  { value: "noindex, nofollow", label: "noindex, nofollow" },
  { value: "", label: "(omit)" },
];

export const OG_TYPES = ["website", "article", "product", "profile", "book", "music.song", "video.movie"];
export const TWITTER_CARDS = ["summary_large_image", "summary", "app", "player"];

export const LIMITS = {
  title: { ideal: 60, max: 70 },
  description: { ideal: 155, max: 200 },
};

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tag(attrs: Record<string, string>): string {
  return `<meta ${Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(" ")}>`;
}

export interface MetaSections {
  basic: string[];
  og: string[];
  twitter: string[];
}

export function buildMetaSections(f: MetaFields): MetaSections {
  const basic: string[] = [];
  const og: string[] = [];
  const twitter: string[] = [];
  const title = f.title.trim();
  const description = f.description.trim();

  basic.push('<meta charset="utf-8">');
  basic.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  if (title) basic.push(`<title>${escapeText(title)}</title>`);
  if (description) basic.push(tag({ name: "description", content: description }));
  if (f.robots) basic.push(tag({ name: "robots", content: f.robots }));
  if (f.canonical.trim()) basic.push(`<link rel="canonical" href="${escapeAttr(f.canonical.trim())}">`);
  if (f.themeColor.trim()) basic.push(tag({ name: "theme-color", content: f.themeColor.trim() }));

  if (title) og.push(tag({ property: "og:title", content: title }));
  if (description) og.push(tag({ property: "og:description", content: description }));
  if (f.ogType) og.push(tag({ property: "og:type", content: f.ogType }));
  const ogUrl = f.ogUrl.trim() || f.canonical.trim();
  if (ogUrl) og.push(tag({ property: "og:url", content: ogUrl }));
  if (f.ogImage.trim()) og.push(tag({ property: "og:image", content: f.ogImage.trim() }));
  if (f.ogSiteName.trim()) og.push(tag({ property: "og:site_name", content: f.ogSiteName.trim() }));

  if (f.twitterCard) twitter.push(tag({ name: "twitter:card", content: f.twitterCard }));
  if (f.twitterSite.trim()) {
    const handle = f.twitterSite.trim();
    twitter.push(tag({ name: "twitter:site", content: handle.startsWith("@") ? handle : `@${handle}` }));
  }
  if (title) twitter.push(tag({ name: "twitter:title", content: title }));
  if (description) twitter.push(tag({ name: "twitter:description", content: description }));
  if (f.ogImage.trim()) twitter.push(tag({ name: "twitter:image", content: f.ogImage.trim() }));

  return { basic, og, twitter };
}

export function buildMetaHtml(f: MetaFields): string {
  const s = buildMetaSections(f);
  const parts: string[] = ["<!-- Basic -->", ...s.basic];
  if (s.og.length) parts.push("", "<!-- Open Graph -->", ...s.og);
  if (s.twitter.length) parts.push("", "<!-- Twitter / X -->", ...s.twitter);
  return parts.join("\n");
}

export const EMPTY_META: MetaFields = {
  title: "",
  description: "",
  canonical: "",
  robots: "index, follow",
  themeColor: "",
  ogType: "website",
  ogUrl: "",
  ogImage: "",
  ogSiteName: "",
  twitterCard: "summary_large_image",
  twitterSite: "",
};
