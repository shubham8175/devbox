#!/usr/bin/env node
/**
 * One-off asset generator for the PWA icon set. Not part of the build
 * pipeline — run manually (`node scripts/generate-icons.mjs`) whenever the
 * source icon design changes, and commit the resulting PNGs.
 *
 * Uses `sharp`, which ships as a transitive dependency of `next` (for its
 * built-in image optimizer) and is not declared directly in package.json.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "..", "public");
const appDir = path.join(root, "..", "src", "app");

// Same accent (#7c8cff) and glyph as src/app/icon.svg, kept in sync by hand.
const ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#7c8cff"/>
  <g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 22 32 12l18 10v20L32 52 14 42z"/>
    <path d="M14 22l18 10 18-10M32 32v20"/>
  </g>
</svg>
`;

// Full-bleed background (no rounded corners) with the glyph scaled down and
// centered so it survives circular/squircle OS masks (maskable icons) and
// Apple's own corner-rounding (apple-touch-icon).
const MASKABLE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#7c8cff"/>
  <g transform="translate(32 32) scale(0.6) translate(-32 -32)">
    <g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 22 32 12l18 10v20L32 52 14 42z"/>
      <path d="M14 22l18 10 18-10M32 32v20"/>
    </g>
  </g>
</svg>
`;

async function render(svg, size, outPath) {
  const buffer = await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(outPath, buffer);
  console.log(`wrote ${path.relative(process.cwd(), outPath)} (${size}x${size})`);
}

async function main() {
  await mkdir(path.join(publicDir, "icons"), { recursive: true });

  await render(ICON_SVG, 192, path.join(publicDir, "icons", "icon-192.png"));
  await render(ICON_SVG, 512, path.join(publicDir, "icons", "icon-512.png"));
  await render(MASKABLE_ICON_SVG, 192, path.join(publicDir, "icons", "icon-maskable-192.png"));
  await render(MASKABLE_ICON_SVG, 512, path.join(publicDir, "icons", "icon-maskable-512.png"));
  await render(MASKABLE_ICON_SVG, 180, path.join(appDir, "apple-icon.png"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
