#!/usr/bin/env node
/**
 * Writes public/sw.js before every production build (the npm "prebuild"
 * script, which npm runs automatically ahead of "build"). The output is
 * gitignored: it changes on every commit because two things are stamped in:
 *
 * - VERSION: the git commit (or Vercel's), so each deploy gets fresh cache
 *   names and `activate` drops the previous deploy's caches instead of
 *   serving stale HTML and chunks forever.
 * - TOOL_URLS: every /tools/<id> route, discovered from src/app/tools/. The
 *   worker warms these into the cache in the background so a tool works
 *   offline even if it has never been opened on this device.
 *
 * The worker only ever touches same-origin GET requests for pages and build
 * assets. DevBox has no API routes and no fetch() carrying tool input, so
 * nothing user-entered can reach the cache (see DOCS.md §12).
 */
import { readdir, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "public", "sw.js");

function resolveVersion() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 10);
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return Date.now().toString(36);
  }
}

/** One folder per tool under src/app/tools/<id>/page.tsx; anything else there (error.tsx, loading.tsx) is skipped. */
async function resolveToolUrls() {
  const dir = path.join(root, "src", "app", "tools");
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => `/tools/${e.name}`)
    .sort();
}

// The worker itself. Kept inline so there is exactly one place to edit it;
// only the two constants at the top of the generated file ever change.
const SW_BODY = String.raw`
const ASSET_CACHE = "devbox-assets-" + VERSION;
const PAGE_CACHE = "devbox-pages-" + VERSION;
const OFFLINE_URL = "/offline";
const SHELL_URLS = ["/", OFFLINE_URL, "/manifest.webmanifest"];

// Build assets referenced from a page's HTML (scripts, stylesheets) and, from
// a stylesheet, the self-hosted fonts. Backslash is excluded because the same
// paths also appear inside escaped JSON in the RSC payload.
const ASSET_IN_HTML = /\/_next\/static\/[^"'\s)\\]+/g;
const FONT_IN_CSS = /\/_next\/static\/media\/[^"'\s)\\]+/g;
const MATCH = { ignoreVary: true };

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        // Best-effort: offline support degrades gracefully if the shell
        // can't be precached (e.g. first install while already offline).
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("devbox-") && name !== ASSET_CACHE && name !== PAGE_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Messages from service-worker-register.tsx:
// - SKIP_WAITING: the user clicked "Update" in the banner. We never skip
//   waiting on our own, so an update never force-refreshes a page mid-use.
// - WARM_CACHE: the page has loaded and is idle; fill the cache with every
//   tool page and its assets so all tools work offline, not just visited ones.
//   A MessageChannel port sent along gets "CACHE_WARMED" once that is done.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  else if (event.data === "WARM_CACHE") {
    event.waitUntil(
      warmCache().then(() => {
        for (const port of event.ports) port.postMessage("CACHE_WARMED");
      }),
    );
  }
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  );
}

function cacheable(response) {
  return response.ok && response.type === "basic" && !response.redirected;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network first, cached copy when offline, then the offline page.
  // Every route is static and reads its query string on the client, so a
  // page is cached under its pathname alone (the share target lands on
  // /tools/qr?text=… and must still resolve offline). Lookups ignore Vary:
  // Next lists its router headers and Accept-Encoding there, and a real
  // navigation never carries the same headers as the fetch that cached it.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (cacheable(response)) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(() => caches.match(url.pathname, MATCH).then((cached) => cached || caches.match(OFFLINE_URL, MATCH))),
    );
    return;
  }

  // Build assets are content-hashed, so cache first is always correct.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request, MATCH).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (cacheable(response)) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

let warming = null;

function warmCache() {
  if (!warming) warming = doWarmCache().finally(() => (warming = null));
  return warming;
}

// Returns the body text of the cached copy of pathname, fetching and storing
// it first when needed; null when it cannot be fetched. The body is read to
// completion BEFORE cache.put(): an entry stored from a still-streaming
// response is visible to match() before it is durable, and if the network
// drops mid-stream the browser rolls it back. Buffering first makes every
// entry complete the moment it appears.
async function ensureCached(cache, pathname) {
  const cached = await cache.match(pathname, MATCH);
  if (cached) return cached.text();
  const response = await fetch(pathname).catch(() => null);
  if (!response || !cacheable(response)) return null;
  const copy = response.clone();
  const body = await response.text();
  await cache.put(pathname, copy);
  return body;
}

async function doWarmCache() {
  const pages = await caches.open(PAGE_CACHE);
  const assets = await caches.open(ASSET_CACHE);

  const assetUrls = new Set();
  await eachLimited([...SHELL_URLS, ...TOOL_URLS], 4, async (pathname) => {
    const html = await ensureCached(pages, pathname);
    if (html === null || pathname === "/manifest.webmanifest") return;
    for (const match of html.matchAll(ASSET_IN_HTML)) assetUrls.add(match[0]);
  });

  const fontUrls = new Set();
  await eachLimited([...assetUrls], 6, async (pathname) => {
    const body = await ensureCached(assets, pathname);
    if (body === null || !pathname.split("?")[0].endsWith(".css")) return;
    for (const match of body.matchAll(FONT_IN_CSS)) fontUrls.add(match[0]);
  });

  await eachLimited([...fontUrls], 6, (pathname) => ensureCached(assets, pathname));
}

async function eachLimited(items, limit, task) {
  const queue = [...items];
  const run = async () => {
    while (queue.length) await task(queue.shift());
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, run));
}
`;

const version = resolveVersion();
const toolUrls = await resolveToolUrls();
const source = `// GENERATED FILE — do not edit by hand. Source: scripts/build-sw.mjs (npm "prebuild").
const VERSION = ${JSON.stringify(version)};
const TOOL_URLS = ${JSON.stringify(toolUrls)};
${SW_BODY}`;

await writeFile(outPath, source);
console.log(`wrote public/sw.js (version ${version}, ${toolUrls.length} tool routes)`);
