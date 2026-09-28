# DevBox Developer Documentation

This document explains how DevBox is built and how to work on it. For the user-facing overview, tool list and keyboard shortcuts, see [README.md](README.md). For the Next.js conventions this version of the framework expects, see [AGENTS.md](AGENTS.md) and the bundled framework docs in `node_modules/next/dist/docs/`.

## Contents

1. [Overview and principles](#1-overview-and-principles)
2. [Getting started](#2-getting-started)
3. [Project structure](#3-project-structure)
4. [Architecture](#4-architecture)
5. [The tool registry](#5-the-tool-registry)
6. [Adding a new tool](#6-adding-a-new-tool)
7. [Shared building blocks](#7-shared-building-blocks)
8. [Client state and persistence](#8-client-state-and-persistence)
9. [Keyboard shortcuts and the command palette](#9-keyboard-shortcuts-and-the-command-palette)
10. [Theming and styling](#10-theming-and-styling)
11. [PWA, offline support and updates](#11-pwa-offline-support-and-updates)
12. [Security and privacy model](#12-security-and-privacy-model)
13. [Input limits and heavy work](#13-input-limits-and-heavy-work)
14. [Error handling](#14-error-handling)
15. [Build, deploy and scripts](#15-build-deploy-and-scripts)
16. [Conventions and checklist](#16-conventions-and-checklist)

---

## 1. Overview and principles

DevBox is a personal toolbox of 80 developer utilities served as a single Next.js app. Every tool runs entirely in the browser.

The rules that shape every design decision:

- **No backend.** There are no API routes, server actions or data fetching. Every route pre-renders to static HTML at build time.
- **Nothing leaves the browser.** User input is never sent anywhere. The Content Security Policy enforces `connect-src 'self'`, so a tool cannot call an external service even by accident.
- **Nothing user-entered is stored.** The only persisted values are UI preferences: favourite tool ids, recent tool ids, sidebar state and the theme.
- **One source of truth.** `src/data/tools.ts` defines every tool once. Navigation, search, routes, metadata, breadcrumbs and shortcuts all derive from it.
- **Pure logic, thin UI.** Tool algorithms live in `src/lib/tools/` with no React imports. Components in `src/components/tools/` only wire state to those functions.

## 2. Getting started

Requirements: Node.js 20 or later and npm. The repo also has a `yarn.lock`, but the scripts below use npm.

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # eslint (next core-web-vitals + typescript rules)
npm run build    # runs scripts/build-sw.mjs first, then next build
npm start        # serve the production build
```

Notes for local development:

- The service worker is only registered in production builds. In `next dev` it is skipped so it never fights Fast Refresh or serves stale responses.
- The CSP adds `'unsafe-eval'` and WebSocket origins in development only, for React DevTools and hot module reload.
- `next dev` rewrites `AGENTS.md`. If it shows up as a change, commit it with your work rather than reverting it.
- There is no test suite yet. Linting and a production build are the current checks.

## 3. Project structure

```
.
├── AGENTS.md / CLAUDE.md      guidance for AI coding agents (auto-maintained by next dev)
├── README.md                  user-facing overview
├── DOCS.md                    this file
├── next.config.ts             security headers and service worker cache headers
├── eslint.config.mjs          next core-web-vitals + typescript presets
├── postcss.config.mjs         Tailwind v4 via @tailwindcss/postcss
├── tsconfig.json              strict TS, "@/*" -> "./src/*"
├── public/
│   ├── icons/                 generated PWA icons (192/512, normal and maskable)
│   └── sw.js                  GENERATED service worker, do not edit by hand
├── scripts/
│   ├── build-sw.mjs           writes public/sw.js with a fresh cache version (prebuild)
│   └── generate-icons.mjs     one-off icon renderer using sharp
└── src/
    ├── app/                   App Router routes
    │   ├── layout.tsx         root layout: fonts, metadata, theme bootstrap, AppShell
    │   ├── page.tsx           home page (search, categories, favourites, recents)
    │   ├── template.tsx       page-enter animation wrapper
    │   ├── error.tsx          root error boundary
    │   ├── not-found.tsx      404 page
    │   ├── manifest.ts        web app manifest (icons, shortcuts, share target)
    │   ├── globals.css        theme tokens and global styles
    │   ├── icon.svg           favicon source
    │   ├── apple-icon.png     generated Apple touch icon
    │   ├── offline/           navigation fallback page for the service worker
    │   └── tools/
    │       ├── error.tsx      per-tool error boundary
    │       ├── loading.tsx    skeleton shown while a tool route loads
    │       └── <tool-id>/page.tsx   one folder per tool
    ├── components/
    │   ├── ui/                design-system primitives (Button, Card, Textarea, ...)
    │   ├── layout/            AppShell, Sidebar, MobileHeader, ThemeToggle, footer
    │   ├── pwa/               service worker registration, update banner, install button
    │   ├── home/              home page search and category grid
    │   ├── tools/             one client component per tool (<id>-tool.tsx)
    │   ├── command-palette.tsx
    │   ├── tool-page.tsx      server wrapper rendering breadcrumbs + header for a tool
    │   ├── tool-card.tsx      card used in home grids
    │   ├── output-row.tsx     labelled copyable result row + OutputGrid
    │   ├── copy-button.tsx
    │   ├── favorite-button.tsx
    │   ├── recent-tracker.tsx records a tool visit
    │   └── highlight.tsx      search-term highlighter
    ├── data/
    │   ├── tools.ts           THE registry: definitions, categories, search
    │   ├── http-status-codes.ts
    │   ├── timezones.ts
    │   └── gitignore-templates.ts
    ├── hooks/                 useCopy, useNow, useHydrated, useDebounced, useRegexWorker
    ├── lib/
    │   ├── store.ts           localStorage-backed preference stores
    │   ├── pwa.ts             live PWA state (online, update waiting, install prompt)
    │   ├── limits.ts          shared input caps
    │   ├── tool-metadata.ts   builds Next Metadata from the registry
    │   ├── utils.ts           cn() class joiner
    │   └── tools/             pure logic modules, one per tool (no React)
    └── types/tool.ts          ToolDefinition, ToolCategory, ToolWithRoute
```

## 4. Architecture

### Rendering model

Every page is a static server component tree with client components leaves. A tool route (`src/app/tools/<id>/page.tsx`) is tiny:

```tsx
import { ToolPage } from "@/components/tool-page";
import { toolMetadata } from "@/lib/tool-metadata";
import { JsonTool } from "@/components/tools/json-tool";

export const metadata = toolMetadata("json");

export default function Page() {
  return (
    <ToolPage toolId="json">
      <JsonTool />
    </ToolPage>
  );
}
```

`ToolPage` is a server component. It looks the tool up in the registry, renders the breadcrumb, icon, title, category badge, description and favourite button, mounts a `RecentTracker`, then renders the tool's client UI. Pass `wide` for tools that need the full main-column width (image and diff tools) and `note` for an extra line under the description.

### Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Logic | `src/lib/tools/*.ts` | Pure functions. Parse, convert, format, validate. Return result objects (`{ ok, ... }`) rather than throwing where practical. No React, no DOM except the canvas helpers. |
| Tool UI | `src/components/tools/*-tool.tsx` | `"use client"` components. Hold input state, call logic with `useMemo`, render results using the shared primitives. |
| Page | `src/app/tools/<id>/page.tsx` | Exports metadata and composes `ToolPage` + tool UI. |
| Shell | `src/components/layout/*` | Sidebar, mobile header, footer, palette, toasts, PWA widgets. Wraps every route via the root layout. |
| Registry | `src/data/tools.ts` | Declares every tool and powers navigation, search and metadata. |

### Application shell

`src/app/layout.tsx` loads the Geist fonts, sets global metadata, injects an inline script that applies the saved theme class before first paint, and renders `AppShell`. `AppShell` (client) provides:

- `ToastProvider` and `CommandPaletteContext`
- the global keyboard handler (see section 9)
- `Sidebar` (desktop, collapsible; mobile, drawer) and `MobileHeader`
- the `<main>` column and footer with the offline indicator and attribution
- `CommandPalette`, `ServiceWorkerRegister` and `UpdateBanner`

## 5. The tool registry

`src/data/tools.ts` exports:

| Export | Purpose |
| --- | --- |
| `categories` | Ordered list of the 16 categories. Drives sidebar and home page order. |
| `tools` | Every `ToolDefinition` with an added `href` of `/tools/<id>`. |
| `popularTools` | Tools flagged `popular: true`, shown in the home page's Popular section. |
| `getTool(id)` | Map lookup by id. |
| `toolsByCategory(category)` | Filter helper used by the sidebar and home grid. |
| `searchTools(query)` | Ranked, typo-tolerant search across name, description, keywords and category. |

A definition looks like this:

```ts
{
  id: "json",                       // stable slug, also the route segment
  name: "JSON Toolbox",
  description: "Format, minify, validate and sort JSON.",
  category: "JSON & Data",          // must be one of ToolCategory
  keywords: ["json", "format", "pretty", "minify", "validate", "sort keys", "beautify"],
  icon: Braces,                     // any lucide-react icon
  popular: true,                    // optional: show in Popular
  shortcut: "g j",                  // optional: two-key sequence, "g" then a key
}
```

Search scoring per query term, highest first: exact name, name prefix, name word prefix, exact keyword, name substring, keyword word prefix, keyword substring, category substring, description substring. A term of three or more characters that matches nothing falls back to a bounded Levenshtein check against name words (and keyword words for terms of four or more), allowing one typo, or two for terms of seven or more. Multi-word queries must match all but one term. Popular tools get a small boost, ties break on shorter then alphabetical names, and an empty query returns all tools in registry order.

The registry is also used by `src/app/manifest.ts` indirectly: the manifest's `shortcuts` list hard-codes five tool URLs, so update it if you rename one of those ids.

## 6. Adding a new tool

Four files, in this order:

1. **Logic** in `src/lib/tools/<id>.ts`. Export pure functions with typed inputs and result objects. Keep it free of React and, unless it is an image tool, free of DOM APIs. Guard against hostile input: cap sizes, avoid prototype pollution when building objects from user keys (see `sortKeysDeep` in `json.ts`, which uses a null-prototype object), and prefer returning `{ ok: false, error }` over throwing.

2. **UI** in `src/components/tools/<id>-tool.tsx`. Start with `"use client"`. Hold input in `useState`, derive results with `useMemo`, and render with the primitives from section 7. Use `CodeTextarea` or `Textarea` for text input so the shared character cap applies. Show validation state with `Badge` and errors with `Alert`. Offer a "Load sample" button when the input is empty and a "Clear" button otherwise; most tools follow this pattern.

3. **Route** in `src/app/tools/<id>/page.tsx` using the template in section 4. Export `metadata = toolMetadata("<id>")`.

4. **Registry entry** in `src/data/tools.ts` under the right `// ---- Category` comment. Pick an icon from `lucide-react`, write six to twelve keywords including likely misspellings and synonyms, and only add a `shortcut` for very frequently used tools.

Then update the tool table in `README.md` and, if you added a category, add it to `ToolCategory` in `src/types/tool.ts` and to `categories` in the registry.

Run `npm run lint` and `npm run build`. The build fails if a page references an id that is not in the registry, because `ToolPage` throws on unknown ids.

If the tool needs a heavy third-party library, load it on demand inside an effect rather than at module top level, so it only ships on that tool's page. The YAML and SQL tools do this:

```ts
import("sql-formatter").then((mod) => { /* use mod.format */ });
```

## 7. Shared building blocks

### UI primitives (`src/components/ui/`)

| Component | Notes |
| --- | --- |
| `Button` | `variant`: `primary`, `secondary` (default), `ghost`, `danger`. `size`: `sm`, `md` (default), `icon`. `asChild` renders the child element (used with `Link`). |
| `Card`, `CardHeader` | Bordered surface. `CardHeader` takes `title`, `description` and an `actions` slot. |
| `Panel` | Lighter grouping container. |
| `Textarea` | Monospace, spellcheck off, `invalid` prop for error styling, `maxLength` defaults to the shared cap. |
| `CodeTextarea` | `Textarea` plus a character and line counter that turns amber at the limit. |
| `Input`, `Label`, `Select` | Form controls with matching styling. |
| `Segmented` | Generic segmented control: `value`, `onChange`, `options: {value, label}[]`, `size`. |
| `Badge` | `tone`: `neutral` (default), `accent`, `success`, `danger`, `warning`. |
| `Alert` | Inline message with icon. `tone`: `info` (default), `success`, `danger`, `warning`. |
| `Kbd` | Keycap styling for shortcuts. |
| `ColorSwatch` | Colour preview with inline style. |
| `Dropzone` | Drag, click or paste to supply a `File`. Filters by `accept`, rejects folders, enforces `maxBytes` (defaults to the image limit for `image/*`). |
| `EmptyState`, `ErrorState` | Placeholder blocks. |
| `ToastProvider`, `useToast` | `toast(message, tone)` shows a bottom-right toast for about two seconds. Keeps at most four. |

### Result rendering

- `OutputRow` renders a labelled value with a copy button. `OutputGrid` lays rows out two-up on wider screens. Almost every tool uses these for results.
- `CopyButton` wraps `useCopy` and the toast. Pass `value`; it disables itself when empty and shows a check mark briefly after copying.
- `Highlight` marks the current search term inside names and descriptions.

### Hooks (`src/hooks/`)

| Hook | Purpose |
| --- | --- |
| `useCopy(resetMs)` | Clipboard write with a hidden-textarea fallback. Returns `{ copied, copy }`. |
| `useNow(intervalMs)` | Current `Date`, ticking. Returns `null` during server render and hydration. |
| `useHydrated()` | `false` on the server and during hydration, `true` after. Use to render random ids or times without mismatches. |
| `useDebounced(value, delayMs)` | Debounced copy of a value for sliders that drive expensive work. |
| `useRegexWorker(pattern, flags, text)` | Runs a regex in a Web Worker with a timeout. See section 13. |

### Image helpers (`src/lib/tools/canvas.ts` and `image-source.tsx`)

`canvas.ts` holds the shared decode, resize, encode and size-check helpers plus the hard limits (25 MB file, 50 megapixels, 16384 px per side, 8192 px output side). It reads dimensions from PNG, JPEG, GIF, BMP and WebP headers before decoding so oversized files are rejected cheaply. `useSourceImage` in `image-source.tsx` wraps decoding with loading and error state and releases bitmaps and object URLs when replaced.

`zip.ts` is a dependency-free STORE-only ZIP writer used by the App Icons tool to bundle PNG output.

## 8. Client state and persistence

`src/lib/store.ts` implements a tiny `useSyncExternalStore` wrapper over `localStorage`. Each store validates what it reads, falls back to a default on bad or missing data, and mirrors changes across tabs via the `storage` event.

| Key | Type | Meaning |
| --- | --- | --- |
| `devbox-favorites` | `string[]` | Starred tool ids. |
| `devbox-recents` | `string[]` | Last eight visited tool ids, newest first. |
| `devbox-sidebar-collapsed` | `boolean` | Desktop sidebar collapsed to icons. |
| `devbox-sidebar-open-categories` | `string[]` | Categories the user expanded in the sidebar. |
| `devbox-theme` | `"light" \| "dark"` | Written by `ThemeToggle`, read by the inline script in `layout.tsx`. |

Only tool ids, booleans and the theme string ever go through storage. Never store tool input or output.

`src/lib/pwa.ts` uses the same subscription pattern for live, non-persisted browser state: online status, whether a new service worker is waiting, and whether the install prompt is available.

## 9. Keyboard shortcuts and the command palette

The global handler lives in `AppShell` and ignores events whose target is an input, textarea, select or contenteditable element.

| Keys | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Toggle the command palette. |
| `/` | Open the palette. |
| `⌘B` / `Ctrl+B` | Collapse or expand the sidebar. |
| `Esc` | Close the palette or the mobile drawer. |
| `g` then `h` | Go home. |
| `g` then a key | Jump to a tool whose registry `shortcut` is `"g <key>"`. The prefix expires after 1.2 seconds. |

The palette mounts only while open so its search state resets each time. With an empty query it shows Recently used, Favorites, then All tools. With a query it shows ranked results from `searchTools`. Arrow keys move, Enter opens, and clicking the backdrop closes.

## 10. Theming and styling

Tailwind CSS v4 is configured entirely in `src/app/globals.css`. Colour tokens are CSS variables on `:root` (dark, the default) and `:root.light`, then exposed to Tailwind through `@theme inline` so utilities like `bg-surface`, `text-fg-muted`, `border-border-strong` and `text-accent-strong` work everywhere.

Token families: `bg`, `bg-elevated`, `surface`, `surface-hover`, `border`, `border-strong`, `fg`, `fg-muted`, `fg-subtle`, `accent`, `accent-strong`, `accent-soft`, `success`, `danger`, `warning` (each with a `-soft` variant) and `ring`.

The theme is a class on `<html>`. The inline script in `layout.tsx` reads `devbox-theme` and adds `light` or `dark` before paint, so there is no flash. `ThemeToggle` swaps the class and writes the preference. A `dark` custom variant exists for the rare case where a utility needs to differ per theme.

Fonts are Geist Sans and Geist Mono via `next/font/google`, exposed as `--font-sans` and `--font-mono`. Use `font-mono` for any user data, code or identifiers.

Helper classes defined in `globals.css` include `skeleton` for loading placeholders, `shadow-card`, `mark-match` and `mark-match-alt` for regex and diff highlighting, and the `animate-*` classes used by the palette, toasts and page transitions.

## 11. PWA, offline support and updates

DevBox is installable and works offline for pages the user has already visited.

- **Manifest** (`src/app/manifest.ts`): standalone display, dark theme colour, four icons (normal and maskable at 192 and 512), five app shortcuts, and a GET-only share target that opens the QR Generator with shared `text` or `url` prefilled. The QR tool reads those query parameters on the client; nothing is posted anywhere.
- **Icons** are produced by `node scripts/generate-icons.mjs`, which renders the SVG glyph with `sharp` (a transitive dependency of Next). Run it manually when the icon design changes and commit the PNGs. Keep the SVG in the script in sync with `src/app/icon.svg`.
- **Service worker** (`public/sw.js`) is generated by `scripts/build-sw.mjs`, which runs as the npm `prebuild` step and stamps a version from the Vercel commit SHA, the local git short SHA, or a timestamp. The worker body lives inside that script; edit it there, never in `public/sw.js`.

Worker behaviour:

- On install it precaches `/`, `/offline` and the manifest.
- On activate it deletes every `devbox-*` cache from previous versions and claims clients.
- Navigations are network-first, cached on success, and fall back to the cached page or `/offline`.
- Static assets under `/_next/static/`, `/icons/` and common image and font extensions are cache-first.
- Only same-origin GET requests are handled. Nothing user-entered ever reaches the cache because no tool makes a request carrying input.
- It never calls `skipWaiting` on its own. `ServiceWorkerRegister` detects a waiting worker and `UpdateBanner` offers Update or Later. Update posts `SKIP_WAITING`; the resulting `controllerchange` event reloads the page once.
- `ServiceWorkerRegister` checks for updates whenever the tab becomes visible.
- `next.config.ts` serves `/sw.js` with `Cache-Control: no-cache` so a new deploy is always discovered.

`InstallButton` appears in the sidebar footer only after the browser fires `beforeinstallprompt` and hides once installed. `OfflineIndicator` shows a small pill in the footer when the browser reports offline.

## 12. Security and privacy model

Security headers are set in `next.config.ts` for every route:

- **Content-Security-Policy**: `default-src 'self'`; scripts only from self plus `'unsafe-inline'` (required by the App Router's hydration scripts on static pages); `connect-src 'self'`; `img-src` allows `https:` solely so the Open Graph preview can load a user-typed image after an explicit click; `frame-ancestors 'none'`; `object-src 'none'`; `upgrade-insecure-requests` in production.
- **Permissions-Policy** disables camera, microphone, geolocation, payment, USB and other powerful features.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` with preload, `Cross-Origin-Opener-Policy: same-origin`, DNS prefetch off, no `X-Powered-By`.

Application-level guarantees:

- No fetch calls carry user input. The only outbound request any tool can make is the image load in the Open Graph preview, triggered by the user.
- Hashing, HMAC, checksums and password generation use the Web Crypto API in the browser.
- Error boundaries deliberately do not report errors. There is no telemetry.
- The share target is GET-only and parsed on the client.

When adding features, keep these invariants. In particular, do not add external script or style origins to the CSP, and do not introduce network calls.

## 13. Input limits and heavy work

Everything runs synchronously on the user's main thread, so limits exist to keep the tab responsive rather than to protect a server.

- `MAX_TEXT_INPUT` in `src/lib/limits.ts` caps every `Textarea` at about 2 MB of text. `CodeTextarea` shows a warning counter at the cap.
- `MAX_PATTERN_LENGTH` caps regular expression patterns.
- Image limits are in `src/lib/tools/canvas.ts` (section 7).
- The Regex Tester evaluates patterns in a Web Worker (`src/lib/tools/regex.worker.ts`) through `useRegexWorker`. Requests are debounced, and if an evaluation exceeds 1.5 seconds the worker is terminated and the tool reports probable catastrophic backtracking. Without Worker support it falls back to synchronous evaluation.
- Tools that can be driven by sliders use `useDebounced` so expensive recomputation waits for the value to settle.

If a new tool can be made slow by adversarial input, add a bounded limit or move the work to a worker rather than trusting the input.

## 14. Error handling

Two error boundaries exist:

- `src/app/tools/error.tsx` wraps every tool route so one tool crashing cannot blank the shell. It recognises stack overflow messages and explains that the input is nested too deeply. A "Try again" button resets the boundary.
- `src/app/error.tsx` is the root fallback with the same behaviour.

`src/app/tools/loading.tsx` renders a skeleton matching the tool header layout while a tool route's JavaScript loads. `src/app/not-found.tsx` handles unknown routes.

Within tools, prefer returning typed error results from logic functions and rendering them with `Alert`, so the boundary is only reached by genuinely unexpected failures.

## 15. Build, deploy and scripts

| Command | What happens |
| --- | --- |
| `npm run dev` | Starts Next.js in development. No service worker. Relaxed CSP for HMR. |
| `npm run build` | npm runs `prebuild` (`scripts/build-sw.mjs`) automatically, then `next build`. Every route is statically generated. |
| `npm start` | Serves the production output with the headers from `next.config.ts`. |
| `npm run lint` | ESLint with the Next core-web-vitals and TypeScript presets. |
| `node scripts/generate-icons.mjs` | Regenerates PWA icons and the Apple touch icon. Manual, commit the output. |

The app is designed for Vercel: static output served from the CDN, `headers()` applied at the edge, and the service worker version taken from `VERCEL_GIT_COMMIT_SHA` when present. Any static host that can set response headers will also work; without the headers the app still functions but loses the CSP and the no-cache rule for `sw.js`.

The `.gitignore` excludes build output, `.env*` files, `tsconfig.tsbuildinfo` and `next-env.d.ts`.

## 16. Conventions and checklist

Code style:

- TypeScript strict mode. Avoid `any`; use discriminated unions for results (`{ ok: true, ... } | { ok: false, error }`).
- Import with the `@/` alias, never relative paths that climb out of a folder.
- Client components start with `"use client"`. Pages and `ToolPage` stay server components.
- Compose classes with `cn()` from `src/lib/utils.ts` and use theme tokens, not raw colours.
- Comment the "why" for anything security- or privacy-related, as the existing code does.
- Add `aria-label`s to icon-only controls and keep the palette and dropzone keyboard-accessible patterns when building similar UI.

Before opening a pull request:

- [ ] Logic lives in `src/lib/tools/`, UI in `src/components/tools/`, route in `src/app/tools/<id>/`.
- [ ] Registry entry added with category, keywords and icon. README tool table updated.
- [ ] No new network calls, storage keys holding user data, or CSP origins.
- [ ] Inputs are bounded and hostile input cannot hang the tab.
- [ ] `npm run lint` and `npm run build` pass.
- [ ] `public/sw.js` was not hand-edited. Worker changes go in `scripts/build-sw.mjs`.
- [ ] If the icon changed, icons were regenerated and committed.
