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
11. [Desktop app (Tauri)](#11-desktop-app-tauri)
12. [Security and privacy model](#12-security-and-privacy-model)
13. [Input limits and heavy work](#13-input-limits-and-heavy-work)
14. [Error handling](#14-error-handling)
15. [Build, deploy and scripts](#15-build-deploy-and-scripts)
16. [Conventions and checklist](#16-conventions-and-checklist)

---

## 1. Overview and principles

DevBox is a personal toolbox of 116 developer utilities served as a single Next.js app. Every tool runs entirely in the browser.

The rules that shape every design decision:

- **No backend.** There are no API routes, server actions or data fetching. Every route pre-renders to static HTML at build time.
- **Nothing leaves the browser.** User input is never sent anywhere. The Content Security Policy enforces `connect-src 'self'`, so a tool cannot call an external service even by accident.
- **Nothing user-entered is stored, unless the user opts in.** The only persisted values are UI preferences: favourite tool ids, recent tool ids, sidebar state and the theme. The single exception is the Scratchpad tool, which writes notes to `localStorage` only after the user enables **Keep notes in this browser** and deletes them when it is switched off.
- **One source of truth.** `src/data/tools.ts` defines every tool once. Navigation, search, routes, metadata, breadcrumbs and shortcuts all derive from it.
- **Pure logic, thin UI.** Tool algorithms live in `src/lib/tools/` with no React imports. Components in `src/components/tools/` only wire state to those functions.

## 2. Getting started

Requirements: Node.js 20 or later and npm. npm is the only supported package manager: `package-lock.json` is the lockfile, and there is no Yarn or pnpm configuration.

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # eslint (next core-web-vitals + typescript rules)
npm test         # vitest, runs src/**/*.test.ts once (npm run test:watch to watch)
npm run test:e2e # playwright: builds, serves the production output and drives Chromium
npm run build    # next build; every route is static
npm start        # serve the production build
npm run desktop:dev   # Tauri window around next dev (needs Rust, see §11)
npm run desktop:build # desktop installers into src-tauri/target/release/bundle/
```

Notes for local development:

- The CSP adds `'unsafe-eval'` and WebSocket origins in development only, for React DevTools and hot module reload.
- `next dev` rewrites `AGENTS.md`. If it shows up as a change, commit it with your work rather than reverting it.
- Unit tests use Vitest in a plain Node environment (no DOM) and live beside the logic they cover as `src/lib/tools/<name>.test.ts`. `vitest.config.mts` maps the `@/` alias to `src/`. Logic modules are the place for unit tests.
- Browser tests use Playwright (`e2e/*.spec.ts`, `playwright.config.ts`). They run against `next start` on port 3457 because the security headers only exist in production. The config builds first; set `PW_SKIP_BUILD=1` to reuse an existing `.next` while iterating. Chromium is the only configured browser. Use them for behaviour that unit tests cannot see: focus order, live regions, downloads, the mobile layout, storage and network audits.

## 3. Project structure

```
.
├── AGENTS.md / CLAUDE.md      guidance for AI coding agents (auto-maintained by next dev)
├── README.md                  user-facing overview
├── DOCS.md                    this file
├── next.config.ts             security headers; static export when the Tauri CLI builds
├── src-tauri/                 Tauri desktop shell: Rust window code, config, icons (§11)
├── eslint.config.mjs          next core-web-vitals + typescript presets
├── postcss.config.mjs         Tailwind v4 via @tailwindcss/postcss
├── tsconfig.json              strict TS, "@/*" -> "./src/*"
├── vitest.config.mts          unit test runner config (Node environment, "@/" alias)
├── playwright.config.ts       browser test runner config (production server on :3457)
├── e2e/                       Playwright specs
├── CASE_STUDY.md              write-up of the Workflows MVP
├── public/
│   ├── icons/                 generated app icons (192/512, normal and maskable)
│   └── sw.js                  service worker, GENERATED by scripts/build-sw.mjs on build (gitignored)
├── scripts/
│   ├── build-sw.mjs           writes public/sw.js with the commit version and every tool route
│   └── generate-icons.mjs     one-off icon renderer using sharp
└── src/
    ├── app/                   App Router routes
    │   ├── layout.tsx         root layout: fonts, metadata, theme bootstrap, AppShell
    │   ├── manifest.ts        web app manifest (/manifest.webmanifest): install, icons, shortcuts, share target
    │   ├── offline/page.tsx   navigation fallback served by the service worker
    │   ├── page.tsx           home page (search, categories, favourites, recents)
    │   ├── template.tsx       page-enter animation wrapper
    │   ├── error.tsx          root error boundary
    │   ├── not-found.tsx      404 page
    │   ├── globals.css        theme tokens and global styles
    │   ├── icon.svg           favicon source
    │   ├── apple-icon.png     generated Apple touch icon
    │   └── tools/
    │       ├── error.tsx      per-tool error boundary
    │       ├── loading.tsx    skeleton shown while a tool route loads
    │       └── <tool-id>/page.tsx   one folder per tool
    ├── components/
    │   ├── ui/                design-system primitives (Button, Card, Textarea, ...)
    │   ├── layout/            AppShell, Sidebar, MobileHeader, ThemeToggle, footer
    │   ├── desktop/           app pill (installer download / Add to Home Screen) and Tauri event bridge
    │   ├── pwa/               ServiceWorkerRegister, UpdateBanner, OfflineIndicator, InstallButton
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
    │   ├── desktop.ts         Tauri detection, desktop and mobile OS detection
    │   ├── pwa.ts             live PWA state: online/offline, waiting worker, install prompt
    │   ├── limits.ts          shared input caps
    │   ├── tool-metadata.ts   builds Next Metadata from the registry
    │   ├── utils.ts           cn() class joiner
    │   └── tools/             pure logic modules, one per tool (no React), plus
    │                          workflow.ts (the Workflows engine) and colocated *.test.ts
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
| Shell | `src/components/layout/*` | Sidebar, mobile header, footer, palette, toasts, desktop bridge. Wraps every route via the root layout. |
| Registry | `src/data/tools.ts` | Declares every tool and powers navigation, search and metadata. |

### Application shell

`src/app/layout.tsx` loads the Geist fonts, sets global metadata, injects an inline script that applies the saved theme class before first paint, and renders `AppShell`. `AppShell` (client) provides:

- `ToastProvider` and `CommandPaletteContext`
- the global keyboard handler (see section 9)
- `Sidebar` (desktop, collapsible; mobile, drawer) and `MobileHeader`, each showing the `OfflineIndicator` pill when the connection drops; the sidebar ends with `InstallButton`. Expanded, it lists All tools, Favorites, Recent and one collapsible section per category, each headed by its `categoryIcons` entry; the current tool's category is always open and the active link is scrolled into view on navigation. Collapsed (`⌘B`), it becomes an icon rail where hovering or focusing a category icon opens a fixed-position flyout of that category's tools, anchored to the icon and clamped to the viewport.
- the `<main>` column and footer with the attribution and the GitHub / LinkedIn links (`AboutFooter`)
- `CommandPalette`, `DesktopBridge`, `ServiceWorkerRegister` and `UpdateBanner`

### Installable web app and offline support

DevBox is a Progressive Web App: phones and desktops can install it from the browser, and every tool works offline. The pieces:

- **Manifest** (`src/app/manifest.ts`): served at `/manifest.webmanifest` and linked automatically by Next. Standalone display, the icons from `public/icons/`, home-screen shortcuts to popular tools, and a GET share target that lands on `/tools/qr` so a shared link or text becomes a QR code without ever leaving the device. `layout.tsx` adds the `appleWebApp` metadata because iOS reads `<meta>` tags rather than the manifest for home-screen installs. Like `sitemap.ts` it declares `dynamic = "force-static"` for the desktop export.
- **Service worker** (`public/sw.js`, generated): `scripts/build-sw.mjs` runs as the npm `prebuild` script and stamps in the commit hash (cache names) and the list of `/tools/<id>` routes read from `src/app/tools/`. The worker precaches `/`, `/offline` and the manifest on install, serves navigations network-first with the cached page as fallback and `/offline` as the last resort, and serves `/_next/static` assets and icons cache-first because they are content-hashed. Pages are cached under their pathname alone, so `/tools/qr?text=…` from the share sheet resolves offline. Only same-origin GET requests are ever touched.
- **Warming**: once the page is idle, `ServiceWorkerRegister` posts `WARM_CACHE` and the worker fetches every tool page plus the scripts, stylesheets and fonts they reference (a few MB in total, skipped when the browser reports Save-Data). That is why a tool that was never opened still works offline. `e2e/pwa.spec.ts` proves it by taking the browser offline and opening a never-visited tool.
- **Updates**: a new deploy installs a new worker that waits. `UpdateBanner` offers "Update"; only then does the page post `SKIP_WAITING` and reload on `controllerchange`. The very first install also fires `controllerchange` (the worker claims open pages) and deliberately does not reload.
- **Register only where it helps**: `ServiceWorkerRegister` is a no-op in development (it would fight Fast Refresh) and inside the Tauri desktop app (the static export is on disk). `/sw.js` is served with `Cache-Control: no-cache` from `next.config.ts` so a deploy is noticed on the next visit.
- **Install UI**: `InstallButton` (sidebar) and the homepage pill call the native `beforeinstallprompt` flow when Chromium offers it, and otherwise show a toast with the manual steps for the visitor's platform (`manualInstallHint` in `src/lib/pwa.ts`). The toast carries an "Install guide" link to the README's Download section (`INSTALL_GUIDE_URL` in `src/lib/site.ts`), and the footer links the repository as "Source & install guide". Both install controls disappear once the app runs standalone.

## 5. The tool registry

`src/data/tools.ts` exports:

| Export | Purpose |
| --- | --- |
| `categories` | Ordered list of the 17 categories. Drives sidebar and home page order. |
| `categoryIcons` | One Lucide icon per category, used by the sidebar headers and the collapsed rail. |
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

The same pattern is used for `prettier/standalone` and its plugins (code and GraphQL formatters), `marked` and `dompurify` (Markdown preview) and `bcryptjs` (password hasher). The JSON Schema validator is a small interpreter in `json-schema-engine.ts` rather than Ajv, because Ajv compiles schemas with `new Function()`, which the Content Security Policy blocks. Logic modules take the loaded module as a parameter (see `YamlModule` in `yaml-json.ts`) so they stay testable in Node by passing the real module.

### Workflows

`src/lib/tools/workflow.ts` is the first step towards DevBox Workflows: fixed pipelines that chain existing tool logic. The MVP has one workflow, JSON → JSONPath → CSV, exposed as the `workflow-json-csv` tool. It follows the same layering as every other tool:

- **Engine.** `runJsonToCsvWorkflow({ json, jsonPath, delimiter })` composes `parseJson`, `queryJsonPath` and `jsonToCsv` without changing them. It returns `{ ok: true, csv, columns, rowCount, matchCount, unwrapped, progress }` or `{ ok: false, step, code, error, progress }`, where `step` is `input`, `parse`, `select` or `convert` and `code` is a stable reason such as `invalid-json`, `no-matches` or `not-tabular`. `progress` records what the completed stages found (root type, top-level keys, match and row counts) so the UI can explain a failure in a later stage. A single match whose value is an array (`$.users`) is unwrapped into rows; several matches (`$.users[*]`) become one row each.
- **UI.** `src/components/tools/workflow-json-csv-tool.tsx` renders a three-step pipeline status, the JSON input, the expression and delimiter, and the CSV output with Copy and Download. The error for the failing step is rendered inside an `aria-live` region and linked to the offending control with `aria-describedby`. Download builds a Blob from the in-memory string; nothing is uploaded.
- **Not yet.** There is no generic step editor, no persistence of workflows, and only this one pipeline. Adding another workflow means another engine function with the same result shape and its own tool entry.

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
| `devbox-scratchpad-enabled` | `boolean` | Whether the Scratchpad may persist notes. Off by default. |
| `devbox-scratchpad-notes` | `Note[]` | Scratchpad notes, present only while the flag above is on. The only key that ever holds user content; `src/lib/scratchpad-store.ts` validates every read and removes the key when persistence is disabled. |

Only tool ids, booleans and the theme string ever go through storage. Never store tool input or output.

CacheStorage is used by the service worker alone (`devbox-pages-<version>` and `devbox-assets-<version>`) and holds only same-origin pages and build assets. `src/lib/pwa.ts` keeps the live, non-persisted PWA state (online/offline, a waiting worker, the deferred install prompt) behind the same `useSyncExternalStore` pattern.

`src/components/desktop/hero-app-pill.tsx` uses the same hook with a `null` server snapshot for values that only exist in the browser (whether the page runs inside the desktop app, and the visitor's OS), so the static HTML and the first client render match.

## 9. Keyboard shortcuts and the command palette

The global handler lives in `AppShell` and ignores events whose target is an input, textarea, select or contenteditable element.

| Keys | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Toggle the command palette. |
| `/` | Open the palette. |
| `⌘B` / `Ctrl+B` | Collapse or expand the sidebar. |
| `⌘[` / `⌘]`, `Alt+←` / `Alt+→` | History back / forward via `router.back()` / `router.forward()`. Browsers do this natively, but the desktop webview has no toolbar. |
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

## 11. Desktop app (Tauri)

The same frontend ships as a native macOS and Windows app through [Tauri v2](https://v2.tauri.app). Nothing moves into the shell: there is no backend to proxy, so the desktop app is the static export of the web app inside a system webview.

```text
Next.js app (unchanged)  →  static export in out/  →  Tauri window (src-tauri/)
```

- **Scripts**: `npm run desktop:dev` starts `next dev` and opens it in a native window; `npm run desktop:build` runs `next build` in export mode and produces the installers. The plain `npm run dev` / `npm run build` web workflow is untouched.
- **Static export is conditional.** The Tauri CLI sets `TAURI_ENV_PLATFORM` for its hook commands; `next.config.ts` switches to `output: "export"` only then. The web build keeps its security headers (which a static export cannot emit); the desktop build gets an equivalent CSP from `src-tauri/tauri.conf.json` (`connect-src` additionally allows Tauri's `ipc:` origin). `robots.ts` and `sitemap.ts` declare `dynamic = "force-static"`, which export mode requires and which changes nothing for the web build. `out/` and `src-tauri/` are excluded from `tsconfig.json` and ESLint.
- **Routing**: Tauri's asset resolver falls back from `/tools/json` to `tools/json.html`, so no `trailingSlash` change is needed and client-side navigation works as on the web.
- **Prerequisites**: Rust (`rustup`, stable) and, on macOS, the Xcode command line tools; on Windows, the Visual Studio C++ build tools and WebView2 (preinstalled on Windows 10/11). Installers are built on the OS they target — there is no cross-compiling.
- **Config** (`src-tauri/tauri.conf.json`): product name DevBox, identifier `in.co.voyra.devbox`, version read from `package.json`, a 1280×840 resizable window with a 720×520 minimum, `bundle.targets: ["dmg", "nsis"]` (one installer per OS: a `.dmg` on macOS, an NSIS `-setup.exe` on Windows), macOS minimum 11.3 (needed for webview downloads). Icons in `src-tauri/icons/` are generated from `src/app/icon.svg` with `npx tauri icon`; the web icons are untouched.
- **Capabilities** (`src-tauri/capabilities/default.json`): only `core:default`. No filesystem, shell, HTTP or dialog plugins are exposed to the webview.
- **The Rust shell** (`src-tauri/src/lib.rs`) builds the main window itself (the config entry has `create: false`) so it can attach three handlers a bare webview lacks:
  - `on_download`: tools save files through `<a download>` blob links, which WKWebView cancels without a handler and WebView2 completes silently. The handler writes the file to the user's Downloads folder (de-duplicating names) and emits `devbox://download-finished`; `DesktopBridge` turns that into the usual toast.
  - `on_new_window` / `on_navigation`: `target="_blank"` links and any navigation off the app's origin (including custom-scheme deep links) open in the system browser or handler instead of inside the window, which is locked to the app's own pages.
  - After the window is built, on macOS it calls `setAllowsBackForwardNavigationGestures(true)` on the raw `WKWebView` (via `with_webview` and `objc2-web-kit`) so the two-finger swipe navigates history like Safari. Wry defaults this to off and Tauri does not expose it. Windows needs nothing: WebView2 handles the mouse back/forward buttons itself.
- **Frontend guards**: `src/lib/desktop.ts` (`isDesktopApp()`, checks `__TAURI_INTERNALS__`) is the single switch. Inside the desktop app the homepage pill reads "Running as an app" instead of linking to the installers, and `DesktopBridge` lazily imports `@tauri-apps/api/event`. On the web none of that code runs.
- **Download pill** (`src/components/desktop/hero-app-pill.tsx`): on a phone or tablet (`detectMobileOs`) it reads "Add to Home Screen" and triggers the web app install instead (section 4); on a desktop browser it is a direct download of the installer for the visitor's OS (`DESKTOP_DOWNLOAD_URLS` in `src/lib/site.ts`), labelled "Download for macOS" / "Download for Windows" from the user agent after hydration; an unknown OS gets the GitHub Releases page (`DESKTOP_RELEASES_URL`). The URLs use GitHub's `releases/latest/download/<file>` redirect, so the asset names are fixed: `DevBox-macOS.dmg` and `DevBox-Windows-Setup.exe`.
- **Release workflow** (`.github/workflows/desktop-release.yml`): runs on every `v*` tag (or manually from the Actions tab). Two build jobs produce exactly one installer each — a universal (Apple Silicon + Intel) `.dmg` via `--target universal-apple-darwin`, and the Windows NSIS `-setup.exe` — rename them to the fixed names above, and a final `publish` job attaches both to a single published (non-draft) release marked as latest. The release only appears once both files exist. To ship: bump `version` in `package.json`, commit, `git tag vX.Y.Z && git push origin vX.Y.Z`. The repository must be **public** for the download links to work for visitors; GitHub returns 404 for release assets of a private repo unless the requester is logged in with access.
- **Output** (local `npm run desktop:build`): `src-tauri/target/release/bundle/macos/DevBox.app` and `bundle/dmg/DevBox_<version>_<arch>.dmg`; on Windows `bundle/nsis/*-setup.exe`. CI builds macOS under `target/universal-apple-darwin/`. Unsigned by default — see the Tauri signing guides for `bundle.macOS.signingIdentity` / notarization and `bundle.windows.certificateThumbprint`, and `plugins.updater` if auto-updates are wanted later.

## 12. Security and privacy model

Security headers are set in `next.config.ts` for every route:

- **Content-Security-Policy**: `default-src 'self'`; scripts only from self plus `'unsafe-inline'` (required by the App Router's hydration scripts on static pages); `connect-src 'self'` plus `https://ipwho.is`, `https://ipinfo.io`, `https://api.ipify.org` and `https://api64.ipify.org` for the IP Location tool (mirrored in `src-tauri/tauri.conf.json`); `img-src` allows `https:` solely so the Open Graph preview can load a user-typed image after an explicit click; `frame-ancestors 'none'`; `object-src 'none'`; `upgrade-insecure-requests` in production.
- **Permissions-Policy** disables camera, microphone, geolocation, payment, USB and other powerful features.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` with preload, `Cross-Origin-Opener-Policy: same-origin`, DNS prefetch off, no `X-Powered-By`.

Application-level guarantees:

- Only one tool sends user input off the device: IP Location (`src/lib/tools/ip-lookup.ts`) posts nothing but GETs `https://ipwho.is/<address>` (falling back to `https://ipinfo.io/<address>/json`) when the user presses Look up or an example chip, and GETs ipify when the user presses Detect my IP. Requests are never issued on load or while typing, reserved addresses (RFC 1918, loopback, link-local, ULA, multicast…) are recognised locally and never sent, and every request has a 10 s timeout. All three services are free, keyless and allow browser calls; ipwho.is allows about 10,000 lookups a month per visitor IP. The only other outbound request is the image load in the Open Graph preview, triggered by the user.
- Hashing, HMAC, checksums, password generation, JWT signing, key pair generation, TOTP, PBKDF2 and certificate fingerprints use the Web Crypto API in the browser. bcrypt uses the pure-JavaScript `bcryptjs`.
- The Markdown preview is the only place HTML from user input is rendered. `marked` output passes through DOMPurify before `dangerouslySetInnerHTML`, and the SVG tool previews through an `<img>` data URL, which cannot execute scripts.
- The Scratchpad is the one tool that may write user content to `localStorage`, and only after an explicit opt-in (section 8).
- Error boundaries deliberately do not report errors. There is no telemetry.
- The share target is GET-only and parsed on the client.
- The service worker intercepts only same-origin GET requests, caches only pages and build assets, and never posts anything. No tool issues a request containing input, so nothing user-entered can reach the cache.

When adding features, keep these invariants. In particular, do not add external script or style origins to the CSP, and do not introduce network calls beyond the explicitly listed, user-triggered ones above.

## 13. Input limits and heavy work

Everything runs synchronously on the user's main thread, so limits exist to keep the tab responsive rather than to protect a server.

- `MAX_TEXT_INPUT` in `src/lib/limits.ts` caps every `Textarea` at about 2 MB of text. `CodeTextarea` shows a warning counter at the cap.
- `MAX_PATTERN_LENGTH` caps regular expression patterns.
- Image limits are in `src/lib/tools/canvas.ts` (section 7).
- The Regex Tester evaluates patterns in a Web Worker (`src/lib/tools/regex.worker.ts`) through `useRegexWorker`. Requests are debounced, and if an evaluation exceeds 1.5 seconds the worker is terminated and the tool reports probable catastrophic backtracking. Without Worker support it falls back to synchronous evaluation.
- Tools that can be driven by sliders use `useDebounced` so expensive recomputation waits for the value to settle.
- The JSON → JSONPath → CSV workflow (`src/lib/tools/workflow.ts`) checks `WORKFLOW_LIMITS` (input size, expression length, rows, distinct columns, cells and output size) before building any CSV text, so a sparse selection cannot explode into a huge table.

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
| `npm run dev` | Starts Next.js in development. Relaxed CSP for HMR. |
| `npm run build` | Runs `prebuild` (below), then `next build`. Every route is statically generated. With `TAURI_ENV_PLATFORM` set (the desktop scripts do this) it becomes a static export into `out/`. |
| `npm run prebuild` | `node scripts/build-sw.mjs`: writes `public/sw.js` with the commit hash and the tool routes. npm runs it automatically before `build`; the output is gitignored. |
| `npm run desktop:dev` | Opens `next dev` inside a native Tauri window. Needs Rust (§11). |
| `npm run desktop:build` | Static export plus native installers in `src-tauri/target/release/bundle/`. |
| `npm start` | Serves the production output with the headers from `next.config.ts`. |
| `npm run lint` | ESLint with the Next core-web-vitals and TypeScript presets. |
| `npm test` | Vitest, single run of `src/**/*.test.ts`. `npm run test:watch` keeps it watching. |
| `npm run test:e2e` | Playwright. Runs `npm run build`, starts `next start -p 3457`, drives Chromium through `e2e/*.spec.ts` (`workflow.spec.ts` for the tool and its privacy audit, `pwa.spec.ts` for the manifest, worker and offline behaviour, `ip-lookup.spec.ts` for the one tool that calls external services: CSP allow-list, mocked and real lookups through the worker, fallback, Detect my IP and offline behaviour). |
| `node scripts/generate-icons.mjs` | Regenerates the web app icons and the Apple touch icon. Manual, commit the output. |

The app is designed for Vercel: static output served from the CDN with `headers()` applied at the edge. Any static host that can set response headers will also work; without the headers the app still functions but loses the CSP.

The `.gitignore` excludes build output, the generated `public/sw.js`, `.env*` files, `tsconfig.tsbuildinfo` and `next-env.d.ts`.

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
- [ ] `npm test`, `npm run lint` and `npm run build` pass. New logic in `src/lib/tools/` has a colocated `*.test.ts`.
- [ ] `npm run test:e2e` passes when the change touches a tool's UI, keyboard behaviour, downloads or the desktop app.
- [ ] If the icon changed, icons were regenerated and committed.
