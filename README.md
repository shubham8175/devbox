# DevBox

Developer tools without the noise. A personal toolbox of 81 developer utilities in one fast, local-only web app.

Live site: [devbox.voyra.co.in](https://devbox.voyra.co.in). The workflow described below is in this branch and will be at `/tools/workflow-json-csv` once deployed.

## For reviewers: Workflow JSON → CSV

The newest addition is a fixed three-step pipeline: parse JSON, select rows with a JSONPath expression, export CSV. It reuses the existing JSON, JSONPath and CSV logic and reports each step's outcome separately.

- Route: `/tools/workflow-json-csv` (page in `src/app/tools/workflow-json-csv/`, UI in `src/components/tools/workflow-json-csv-tool.tsx`)
- Engine: `src/lib/tools/workflow.ts`, pure TypeScript with typed errors and input, row, column and output limits
- Write-up: [CASE_STUDY.md](CASE_STUDY.md) covers the problem, architecture, privacy decisions, edge cases, measured results and a demo script
- Tests: 40 unit tests (`npm test`) and 9 Playwright browser tests (`npm run test:e2e`) cover this workflow only. The other 80 tools are checked by lint, type-checking and the production build; they have no automated tests yet.

Everything runs in the browser. No accounts, no database, no backend, and nothing you paste or upload is stored or sent anywhere. Images and QR codes are processed with the Canvas API on your machine. The only outbound request any tool can make is the Open Graph preview's optional "Load remote image" button, which asks your browser to fetch the image URL you typed.

## Tools

81 tools across 16 categories. The full registry lives in `src/data/tools.ts`; every tool is served at `/tools/<id>`.

| Category | Tools |
| --- | --- |
| Time | Epoch, Date Difference, Timezone, Cron |
| MongoDB | ObjectId, Query Formatter |
| Database | SQL Formatter |
| API & HTTP | cURL Converter, API Response Inspector, HTTP Status Codes, HTTP Header Parser, Cookie Parser, Query String Builder, Pagination, Retry / Backoff |
| JSON & Data | JSON Toolbox, JSON Diff, JSON → Types, CSV ↔ JSON, YAML ↔ JSON, XML ↔ JSON, Flatten / Unflatten, Array Toolbox, JSONPath, Workflow: JSON → CSV |
| Encoding | Base64, Escape / Unescape |
| Security | JWT, Hash, HMAC, Password Generator, Password Strength, File Checksum, .env Comparator, .env Validator |
| Text | String Case, Regex, Text Diff, Line & Text Toolbox, Slug, Invisible Characters, Unicode Inspector |
| Git | Commit Builder, .gitignore Generator, Diff Viewer, Semver, npm Range Explainer |
| Web | URL Toolbox, Meta Tags, Open Graph Preview, Device & Browser Info |
| CSS | Color Converter, Unit Converter, Gradient, Box Shadow |
| Images & QR | Color Picker, Metadata, Compressor, Resizer, Format Converter, Image → Base64, App Icons, Aspect Ratio, QR Generator, QR Reader |
| Mobile | Deep Link Builder, Android Intent URI |
| Networking & Geo | IP / CIDR, IP ↔ Integer, Coordinate Distance, Lat / Lng Formatter |
| Generators | UUID, Random ID, Mock Data |
| Utilities | Unix Permissions, File Size, GST / VAT, Number Base, Bitwise, Stack Trace Cleaner, Log Pretty Printer |

Shortcuts: `⌘K` / `Ctrl+K` opens the command palette, `/` also opens it, `⌘B` / `Ctrl+B` collapses the sidebar, `Esc` closes overlays, and two-key sequences jump straight to tools (`g h` home, `g j` JSON, `g e` Epoch, `g t` JWT, `g o` ObjectId, `g u` UUID, `g r` Regex). Star any tool to pin it to Favorites; recently used tools appear on the home page.

## Stack

Next.js (App Router, `src/` directory), TypeScript, Tailwind CSS v4, ESLint, Vitest and Playwright. Package manager: npm, with `package-lock.json` as the only lockfile. Node.js 20 or later. Runtime dependencies beyond React and Next: `lucide-react` (icons), `qrcode` and `jsqr` (QR), `yaml`, `sql-formatter` (loaded on demand only on their tool pages) and `semver`. Everything else, including CSV, XML, JSONPath, EXIF, ZIP and diff logic, is implemented in `src/lib/tools`.

## Structure

```
src/
  app/            routes (one folder per tool under app/tools)
  components/     ui primitives, layout, command palette, per-tool UIs
  data/           tools registry, HTTP status codes, timezones
  hooks/          useCopy, useNow, useHydrated
  lib/store.ts    favorites / recents / sidebar preferences (tool ids and booleans only)
  lib/tools/      pure utility logic, no React (workflow.ts has colocated unit tests)
  types/          shared types
e2e/              Playwright browser tests for the workflow page
```

`src/data/tools.ts` is the single source of truth for navigation, search, routes, descriptions, keywords and categories.

## Developer docs

Architecture, the tool registry, how to add a tool, PWA and security details are in [DOCS.md](DOCS.md).

## Scripts

```bash
npm install          # npm only; there is no Yarn or pnpm lockfile
npm run dev          # start the dev server
npm run build        # production build
npm start            # serve the production build
npm run lint         # eslint
npx tsc --noEmit     # type-check
npm test             # unit tests (vitest), currently the workflow engine
npm run test:e2e     # browser tests (playwright), builds and serves production first
```
