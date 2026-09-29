export type LoremMode = "words" | "sentences" | "paragraphs";
export type LoremFormat = "plain" | "html" | "markdown";

export interface LoremOptions {
  mode: LoremMode;
  count: number;
  startWithLorem: boolean;
  format: LoremFormat;
  /** Seed for the PRNG so output is reproducible (tests, SSR-safe first render). */
  seed?: number;
}

export const LOREM_LIMITS: Record<LoremMode, number> = { words: 1000, sentences: 100, paragraphs: 50 };

/** The classic word list from the "Lorem ipsum dolor sit amet" passage. */
export const LOREM_WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo", "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate", "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint", "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia", "deserunt", "mollit", "anim", "id", "est", "laborum", "at", "vero", "eos", "accusamus", "iusto", "odio", "dignissimos", "ducimus",
];

const LOREM_OPENING = ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit"];

/** mulberry32: tiny, fast, deterministic 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const between = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = (rng: Rng) => LOREM_WORDS[Math.floor(rng() * LOREM_WORDS.length)];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A sentence of 6–14 words, with an occasional comma in the middle. */
function sentenceWords(rng: Rng, opening: string[] | null): string[] {
  const words = opening ? [...opening] : [];
  const target = Math.max(words.length, between(rng, 6, 14));
  while (words.length < target) words.push(pick(rng));
  if (words.length >= 8 && rng() < 0.6) {
    const at = between(rng, 3, words.length - 3);
    words[at] = words[at] + ",";
  }
  return words;
}

function sentence(rng: Rng, opening: string[] | null): string {
  const words = sentenceWords(rng, opening);
  return capitalize(words.join(" ")) + ".";
}

function paragraph(rng: Rng, opening: string[] | null): string {
  const n = between(rng, 3, 7);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(sentence(rng, i === 0 ? opening : null));
  return out.join(" ");
}

export function generateLorem(opts: LoremOptions): string {
  const rng = mulberry32(opts.seed ?? 1);
  const count = Math.max(0, Math.min(Math.floor(opts.count) || 0, LOREM_LIMITS[opts.mode]));
  if (count === 0) return "";
  const opening = opts.startWithLorem ? LOREM_OPENING : null;

  let paragraphs: string[];
  if (opts.mode === "words") {
    const words: string[] = opening ? [...opening] : [];
    while (words.length < count) words.push(pick(rng));
    paragraphs = [capitalize(words.slice(0, count).join(" "))];
  } else if (opts.mode === "sentences") {
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(sentence(rng, i === 0 ? opening : null));
    paragraphs = [out.join(" ")];
  } else {
    paragraphs = [];
    for (let i = 0; i < count; i++) paragraphs.push(paragraph(rng, i === 0 ? opening : null));
  }

  if (opts.format === "html") return paragraphs.map((p) => `<p>${p}</p>`).join("\n");
  return paragraphs.join("\n\n");
}

export interface PlaceholderImageOptions {
  width: number;
  height: number;
  text?: string;
  background: string;
  foreground: string;
}

export const PLACEHOLDER_MAX_SIDE = 4096;

export const placeholderPresets: Array<{ id: string; label: string; width: number; height: number }> = [
  { id: "avatar", label: "Avatar", width: 128, height: 128 },
  { id: "thumbnail", label: "Thumbnail", width: 320, height: 180 },
  { id: "banner", label: "Banner", width: 1200, height: 400 },
  { id: "og", label: "OG image", width: 1200, height: 630 },
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
];

const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const isColor = (s: string) => /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) || /^[a-z]{3,20}$/i.test(s);

/** A self-contained SVG box with a centred label (defaults to "W×H"). */
export function placeholderImageSvg(opts: PlaceholderImageOptions): string {
  const width = Math.max(1, Math.min(Math.round(opts.width) || 1, PLACEHOLDER_MAX_SIDE));
  const height = Math.max(1, Math.min(Math.round(opts.height) || 1, PLACEHOLDER_MAX_SIDE));
  // Only plain colours are allowed so the SVG cannot smuggle url() references or scripts.
  const background = isColor(opts.background) ? opts.background : "#e5e7eb";
  const foreground = isColor(opts.foreground) ? opts.foreground : "#6b7280";
  const label = (opts.text ?? "").trim() || `${width}×${height}`;
  const fontSize = Math.max(10, Math.round(Math.min(width / Math.max(4, label.length * 0.6), height / 4)));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">` +
    `<rect width="100%" height="100%" fill="${escapeXml(background)}"/>` +
    `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${fontSize}" fill="${escapeXml(foreground)}">${escapeXml(label)}</text>` +
    `</svg>`
  );
}

/** Encode an SVG string as a data: URL, either base64 or percent-encoded UTF-8. */
export function toDataUrl(svg: string, encoding: "base64" | "utf8" = "utf8"): string {
  if (encoding === "base64") {
    const bytes = new TextEncoder().encode(svg);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return `data:image/svg+xml;base64,${btoa(bin)}`;
  }
  const encoded = encodeURIComponent(svg).replace(/%20/g, " ").replace(/%3D/g, "=").replace(/%3A/g, ":").replace(/%2F/g, "/").replace(/%2C/g, ",");
  return `data:image/svg+xml,${encoded}`;
}

export const LOREM_SAMPLE = generateLorem({ mode: "paragraphs", count: 2, startWithLorem: true, format: "plain", seed: 42 });
