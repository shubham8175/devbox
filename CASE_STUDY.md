# Case study: DevBox Workflows MVP (JSON → JSONPath → CSV)

A short account of the first DevBox workflow: what problem it solves, how it is built, the privacy and safety decisions behind it, and what the tests actually check. All numbers below were measured on this repository; nothing is estimated.

## 1. The user problem

The developer task is common: take a JSON payload, usually an API response, pick the records inside it, and hand them to someone as a spreadsheet. DevBox already had the two halves of that job as separate tools, a JSONPath tester and a CSV converter, so doing it meant querying in one tool, copying the matches, pasting them into the other, and fixing the shape by hand when the copied value was not an array of objects. When the result was empty, nothing said which of the two steps had gone wrong.

The workflow puts the three steps on one page: paste JSON, select rows with a JSONPath expression, get CSV to copy or download. Each step reports its own outcome, so an empty result is attributed to parsing, selection or conversion rather than left to guesswork.

The MVP is deliberately a single fixed pipeline with three visible stages. It is not a generic workflow editor, and no user research is claimed; the design follows from the mechanics of the two existing tools.

## 2. Architecture

The feature follows the existing DevBox split of pure logic, thin client UI, and a registry entry.

| Layer | File | Role |
| --- | --- | --- |
| Engine | `src/lib/tools/workflow.ts` | `runJsonToCsvWorkflow({ json, jsonPath, delimiter })`. Composes the existing `parseJson`, `queryJsonPath` and `jsonToCsv` without modifying them. Returns a discriminated union: success with the CSV, columns, row and match counts, or a typed error with `step`, `code`, message and optional line/column. Both carry `progress`, a summary of the stages that completed. |
| UI | `src/components/tools/workflow-json-csv-tool.tsx` | Client component holding input in React state. Derives the result with `useMemo`, renders a three-step pipeline status, the inputs, and the CSV output with Copy and Download. |
| Route | `src/app/tools/workflow-json-csv/page.tsx` | Static page using the shared `ToolPage` header and metadata helper. |
| Registry | `src/data/tools.ts` | One entry under JSON & Data. Navigation, search, sitemap and metadata derive from it. |

Row selection rules in the engine:

- Several matches, such as `$.users[*]`, become one row each.
- A single match whose value is an array, such as `$.users`, is unwrapped so its elements become rows.
- A single object match becomes a one-row CSV. Arrays of arrays produce header-less rows.
- Column order is the order keys are first seen across rows. Missing keys become empty cells. Nested values are JSON-serialised into the cell.

Error codes are stable strings the UI switches on: `invalid-json`, `invalid-jsonpath`, `no-matches`, `not-tabular`, `input-too-large`, `expression-too-long`, `invalid-delimiter`, `too-many-rows`, `too-many-columns`, `output-too-large`. The `step` field says whether the failure belongs to parsing, selection or conversion, and the UI attributes limit errors to the stage whose input they concern.

## 3. Privacy decisions

DevBox's rule is that nothing a user pastes leaves the browser or survives the tab. The workflow keeps that rule and the tests check it rather than assume it.

- **Memory only.** Input, expression and CSV live in component state. There is no storage key, no URL parameter, no analytics and no request carrying them. The download builds a Blob from the in-memory string and revokes the object URL afterwards.
- **No new network surface.** No dependency, script origin or CSP change was needed. `connect-src 'self'` still applies.
- **Service worker stays clean.** The worker only caches same-origin GET navigations and static assets. The tool never issues a request containing input, so nothing user-entered can reach the cache.
- **Verified in a browser.** A Playwright test types a sentinel string into the JSON and the expression, triggers a download, then asserts that no request URL or body contained it, every request was same-origin, no request had a body at all, the URL did not change, localStorage and sessionStorage do not contain it, IndexedDB has no databases, cookies do not contain it, and a reload starts with an empty input.

## 4. Edge cases and limits

Everything runs synchronously on the main thread, so the limits exist to keep the tab responsive, not to protect a server.

| Case | Behaviour |
| --- | --- |
| Invalid JSON | Typed error with the engine's message plus line and column when the runtime reports a position. Stages 2 and 3 show as skipped. |
| Invalid JSONPath | Parse error from the existing evaluator, attributed to stage 2. The expression input gets `aria-invalid` and `aria-describedby` pointing at the error. |
| Zero matches | Distinct `no-matches` code. The UI adds a hint: the document's top-level keys for an object root, or "start with `$[*]`" for an array root. An expression that matches an empty array is also reported as zero rows. |
| Values that are not rows | Selecting primitives, a mix of objects and arrays, or a primitive root gives `not-tabular` with a count by type ("3 strings") and a suggestion to select the parent objects. |
| Input size | Rejected before parsing above the shared 2,000,000-character cap. |
| Expression length | Rejected above 1,000 characters. |
| Rows | At most 10,000, whether matched directly or unwrapped. The JSONPath evaluator's own match cap is surfaced with the same code. |
| Columns and cells | Distinct keys are counted with a Set before any CSV text is built, capped at 500 columns and 1,000,000 cells. This stops sparse rows with disjoint keys from exploding into a huge table. |
| Output size | Final CSV text capped at 5,000,000 characters. |
| Deep nesting | The JSONPath evaluator already maps stack overflows to an error. CSV serialisation of a 200,000-deep value throws a `RangeError`, which the engine catches and reports as "nested too deeply". |
| Hostile regex in a filter | The existing evaluator caps regex length and catches construction errors. A backtracking pattern is exercised in the no-throw sweep. |

Known behaviour worth stating: key unions such as `$.users[*]['id','name']` return the selected values in this JSONPath implementation, not projected objects, so they fail with `not-tabular`. The examples on the page avoid that form.

## 5. What the tests verify

### Unit tests (Vitest, `src/lib/tools/workflow.test.ts`, 40 tests)

- Row selection rules in isolation: several matches, single-array unwrapping, single object.
- Successful conversions: wildcard and unwrapped selections produce identical CSV, filters and slices, one-row objects, column union with blanks, quoting of delimiters, quotes and newlines, nested values, custom delimiter, header-less arrays of arrays, the bundled sample with every example expression, and the progress summary.
- Each error class with its `step` and `code`: invalid JSON with position, empty input, four malformed expressions, zero matches with hints for object and array roots, an empty matched array, a filter that excludes everything, primitives, mixed shapes, primitive root, and 200,000-deep nesting.
- Every limit, using injected small limits so the tests stay fast, plus one real test at the 2,000,000-character input cap.
- A no-throw sweep over hostile inputs and expressions.

### Browser tests (Playwright against `next start`, `e2e/workflow.spec.ts`, 9 tests)

1. **Sample workflow.** Load sample produces the expected header and four rows, all three stages read Done with the right details, an example chip re-runs with a filter, `$.users` unwraps to the same rows, the delimiter switch is reflected, and Clear resets.
2. **Invalid JSON.** Stage 1 Failed, later stages Skipped, the live region names the stage and line, the textarea carries `aria-invalid` and a working `aria-describedby`, Download is disabled.
3. **Invalid JSONPath.** Stage 2 Failed with the input marked invalid, and recovery clears the live region.
4. **Zero matches.** The hint lists `"users", "meta"`, and an array root gets the `$[*]` hint.
5. **Download.** The file is named `workflow.csv` and its bytes equal the CSV shown on screen.
6. **Keyboard only.** Enter on Load sample, Tab order through textarea, expression, delimiter and example chips, typing a new expression, and Enter on a chip updating the expression and `aria-pressed`.
7. **Privacy audit.** The sentinel test described in section 3.
8. **Mobile layout** at 390×844 with touch: no horizontal overflow, panels stacked in order, each within the viewport, Download and Copy visible.
9. **Offline.** After the service worker controls the page and one controlled load has cached it, the context goes offline, the page is navigated to again, the header and the Offline pill render, and Load sample still produces CSV.

The browser suite found one real bug before shipping: the stage detail read "4 matchs → 4 rows" because the pluraliser appended "s" blindly. It is fixed and covered.

## 6. Measured results

Environment: Apple M5 Pro, Node v22.21.1, engine timings from a one-off Vitest run (5 runs each, median reported, single thread, Node rather than a browser). Browser test times are from the Playwright list reporter on the same machine.

| Scenario | Input | Result |
| --- | --- | --- |
| 10,000 rows, `$.users` | 1,607,357 chars | 7.8 ms |
| 10,000 rows, `$.users[*]` | same | 5.7 ms |
| 10,000 rows, `$.users[?(@.active)]` | same | 4.7 ms |
| 12,000 rows, `$.users` | 1,935,489 chars | rejected as `too-many-rows` in 2.2 ms |
| 12,000 rows, `$.users[0:10000]` | same | 6.2 ms |
| 10,000 sparse rows with 10,500 distinct keys, `$` | 235,581 chars | rejected as `too-many-columns` in 1.9 ms, before any CSV text is built |
| 200,000-deep nested value | 400,013 chars | rejected as nested too deeply in 13.6 ms |

| Check | Result |
| --- | --- |
| `npm test` | 40 passed |
| `npm run test:e2e` | 9 passed, 11.4 s total; slowest was the offline test at 1.6 s |
| `npm run lint` | clean |
| `npx tsc --noEmit` | clean |
| `npm run build` | success, route prerendered as static |

In-browser timings for large inputs were not measured; the engine numbers above are the only performance figures.

## 7. Demo script (about three minutes)

1. Open `/tools/workflow-json-csv`. Point out the three stage cards reading Waiting and the disabled Download and Copy buttons.
2. Click **Load sample**. All three stages turn to Done. Read the details aloud: "Object with 2 keys", "4 matches → 4 rows", "4 rows × 7 columns". Show the CSV, including the `team` column that only one row has and the blank cells for the others.
3. Click the **`$.users[?(@.active)]`** chip. Three rows now. Then type `$.users` to show that selecting the array itself gives the same rows, with the detail explaining it was unwrapped.
4. Break it on purpose: change the expression to `$.customers[*]`. Stage 2 fails and the message lists the top-level keys that do exist. Replace the JSON with `[1, 2, 3]` to show the array-root hint.
5. Type `$.users[` to show a syntax error attributed to stage 2 while stage 1 stays Done, then delete a comma in the JSON to show stage 1 failing with a line number while stages 2 and 3 read Skipped.
6. Restore the sample, pick the semicolon delimiter, click **Download CSV** and open the file.
7. Open DevTools. On the Network tab show that typing produces no requests. On the Application tab show localStorage holds only DevBox preference keys and the input is absent. Reload: the textarea is empty.
8. If time allows: with the production build served, load the page once, tick Offline in DevTools, reload, and run the sample again.

## 8. Limitations

- One fixed pipeline. No step editor, no saved workflows, no other input or output formats.
- Key unions in the JSONPath engine select values, not projected objects, so column projection has to be done by selecting parent objects.
- Nested values are flattened by JSON-serialising them into a cell rather than expanding into dotted columns.
- Everything runs on the main thread. The limits keep the tab responsive for hostile input, but a Web Worker would be the next step if larger documents are needed.
- Browser tests run in Chromium only, on a local production server. The offline test exercises the real service worker but not an installed PWA.
