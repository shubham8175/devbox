import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Set by the Tauri CLI for its beforeDevCommand/beforeBuildCommand hooks
 * (`npm run desktop:dev` / `npm run desktop:build`). The desktop shell can
 * only serve static files, so those builds use `output: "export"` into
 * `out/`. Plain `next build` / `next dev` (the Vercel deployment) are
 * unaffected and keep the security headers below, which a static export
 * cannot emit — the desktop build gets its CSP from src-tauri/tauri.conf.json.
 */
const isDesktopBuild = Boolean(process.env.TAURI_ENV_PLATFORM);

/**
 * DevBox is frontend-only: no API routes, no server actions, no data fetching.
 * Every route pre-renders to static HTML at build time and Vercel serves it
 * from its CDN, so `headers()` below is the only server-side behaviour.
 *
 * CSP notes:
 * - `script-src 'unsafe-inline'` is required by the Next.js App Router for its
 *   inline hydration scripts on statically generated pages (nonces need dynamic
 *   rendering, which would defeat the static deployment). No external script
 *   origins are allowed. `'unsafe-eval'` is only added in development for React
 *   DevTools / HMR.
 * - `style-src 'unsafe-inline'` covers React inline `style` attributes (colour
 *   swatches, gradients) and Tailwind's injected styles.
 * - `img-src https:` exists solely for the Open Graph preview tool, which loads
 *   a user-typed image URL only after an explicit "Load remote image" click.
 * - `connect-src 'self'` guarantees no tool can call an external service.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const permissionsPolicy = [
  "accelerometer=()",
  "autoplay=()",
  "bluetooth=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "hid=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "serial=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: permissionsPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(isDesktopBuild ? { output: "export", images: { unoptimized: true } } : {}),
  async headers() {
    if (isDesktopBuild) return [];
    return [
      { source: "/(.*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
