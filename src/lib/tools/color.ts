export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface HSLA {
  h: number;
  s: number;
  l: number;
  a: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number, places = 0) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

export function rgbToHex({ r, g, b, a }: RGBA, includeAlpha = false): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  const base = `#${h(r)}${h(g)}${h(b)}`;
  return includeAlpha || a < 1 ? `${base}${h(a * 255)}` : base;
}

export function rgbToHsl({ r, g, b, a }: RGBA): HSLA {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h: round(h, 1), s: round(s * 100, 1), l: round(l * 100, 1), a };
}

export function hslToRgb({ h, s, l, a }: HSLA): RGBA {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v, a };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(hn) * 255),
    b: Math.round(hue2rgb(hn - 1 / 3) * 255),
    a,
  };
}

/** Parse HEX (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb()/rgba(), hsl()/hsla() strings. */
export function parseColor(raw: string): RGBA | null {
  const input = raw.trim().toLowerCase();
  if (!input) return null;

  const hex = input.startsWith("#") ? input.slice(1) : /^[0-9a-f]{3,8}$/.test(input) ? input : null;
  if (hex && /^[0-9a-f]+$/.test(hex)) {
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = hex.split("").map((c) => parseInt(c + c, 16));
      return { r, g, b, a: hex.length === 4 ? round(a / 255, 3) : 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? round(parseInt(hex.slice(6, 8), 16) / 255, 3) : 1;
      return { r, g, b, a };
    }
    return null;
  }

  const fn = /^(rgba?|hsla?)\(\s*([^)]+)\)$/.exec(input);
  if (!fn) return null;
  const [, name, body] = fn;
  const parts = body
    .replace(/\//g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;

  const num = (s: string, scale: number): number | null => {
    if (s.endsWith("%")) {
      const v = parseFloat(s);
      return Number.isFinite(v) ? (v / 100) * scale : null;
    }
    const v = parseFloat(s.replace(/deg$/, ""));
    return Number.isFinite(v) ? v : null;
  };

  const alphaRaw = parts[3];
  let a = 1;
  if (alphaRaw !== undefined) {
    const av = alphaRaw.endsWith("%") ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw);
    if (!Number.isFinite(av)) return null;
    a = clamp(av, 0, 1);
  }

  if (name.startsWith("rgb")) {
    const r = num(parts[0], 255);
    const g = num(parts[1], 255);
    const b = num(parts[2], 255);
    if (r === null || g === null || b === null) return null;
    return { r: clamp(Math.round(r), 0, 255), g: clamp(Math.round(g), 0, 255), b: clamp(Math.round(b), 0, 255), a };
  }
  const h = num(parts[0], 360);
  const s = parts[1].endsWith("%") ? parseFloat(parts[1]) : parseFloat(parts[1]);
  const l = parts[2].endsWith("%") ? parseFloat(parts[2]) : parseFloat(parts[2]);
  if (h === null || !Number.isFinite(s) || !Number.isFinite(l)) return null;
  return hslToRgb({ h, s, l, a });
}

export interface ColorFormats {
  hex: string;
  hexAlpha: string;
  rgb: string;
  rgba: string;
  hsl: string;
  hsla: string;
  css: string;
}

export function formatColor(c: RGBA): ColorFormats {
  const hsl = rgbToHsl(c);
  const a = round(c.a, 3);
  return {
    hex: rgbToHex({ ...c, a: 1 }),
    hexAlpha: rgbToHex(c, true),
    rgb: `rgb(${c.r}, ${c.g}, ${c.b})`,
    rgba: `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`,
    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    hsla: `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${a})`,
    css: a < 1 ? `rgb(${c.r} ${c.g} ${c.b} / ${a})` : rgbToHex({ ...c, a: 1 }),
  };
}

/** Relative luminance per WCAG, used to pick readable text on the preview. */
export function luminance({ r, g, b }: RGBA): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
