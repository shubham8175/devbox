import { expect, test, type Page } from "@playwright/test";

const ROUTE = "/tools/workflow-json-csv";
const SAMPLE_HEADER = "id,name,email,role,active,score,team";
/** A string that never appears in the app; if it shows up in a request, URL or storage, input leaked. */
const SENTINEL = "zq7-private-marker-4481";

const ui = (page: Page) => ({
  json: page.getByLabel("JSON document"),
  expression: page.getByLabel("JSONPath expression"),
  delimiter: page.getByLabel("CSV delimiter"),
  csv: page.getByLabel("CSV output"),
  loadSample: page.getByRole("button", { name: "Load sample" }),
  clear: page.getByRole("button", { name: "Clear" }),
  download: page.getByRole("button", { name: "Download CSV file" }),
  copyCsv: page.getByRole("button", { name: "Copy CSV" }),
  steps: page.getByRole("list", { name: "Workflow steps" }).getByRole("listitem"),
  // The pipeline's live region: empty until a stage fails.
  error: page.locator('[aria-live="polite"][aria-atomic="true"]'),
});

test.describe("Workflow: JSON → CSV", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByRole("heading", { level: 1, name: "Workflow: JSON → CSV" })).toBeVisible();
  });

  test("runs the sample end to end", async ({ page }) => {
    const w = ui(page);
    await expect(w.steps).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(w.steps.nth(i)).toContainText("Waiting");
    await expect(w.download).toBeDisabled();
    await expect(w.copyCsv).toBeDisabled();

    await w.loadSample.click();
    await expect(w.json).not.toBeEmpty();
    await expect(w.expression).toHaveValue("$.users[*]");

    const csv = await w.csv.inputValue();
    const lines = csv.split("\n");
    expect(lines[0]).toBe(SAMPLE_HEADER);
    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe("1,Ada Lovelace,ada@example.com,admin,true,98.5,");
    expect(lines[4]).toContain("Apollo");

    for (let i = 0; i < 3; i++) await expect(w.steps.nth(i)).toContainText("Done");
    await expect(w.steps.nth(0)).toContainText("Object with 2 keys");
    await expect(w.steps.nth(1)).toContainText("4 matches → 4 rows");
    await expect(w.steps.nth(2)).toContainText("4 rows × 7 columns");
    await expect(w.error).toBeEmpty();
    await expect(w.download).toBeEnabled();
    await expect(w.copyCsv).toBeEnabled();

    // An example chip re-runs the pipeline with a filter.
    await page.getByRole("button", { name: /Only active users/ }).click();
    await expect(w.expression).toHaveValue("$.users[?(@.active)]");
    await expect(w.steps.nth(1)).toContainText("3 matches → 3 rows");
    expect((await w.csv.inputValue()).split("\n")).toHaveLength(4);

    // Selecting the array itself unwraps it into the same rows.
    await w.expression.fill("$.users");
    await expect(w.steps.nth(1)).toContainText("1 match, an array of 4 items → 4 rows");

    // A different delimiter is reflected immediately.
    await w.delimiter.selectOption(";");
    expect((await w.csv.inputValue()).split("\n")[0]).toBe(SAMPLE_HEADER.replaceAll(",", ";"));

    await w.clear.click();
    await expect(w.json).toBeEmpty();
    await expect(w.steps.nth(0)).toContainText("Waiting");
  });

  test("reports invalid JSON against step 1 and links the error to the textarea", async ({ page }) => {
    const w = ui(page);
    await w.json.fill('{\n  "users": [\n    {"id": 1,}\n  ]\n}');

    await expect(w.steps.nth(0)).toContainText("Failed");
    await expect(w.steps.nth(1)).toContainText("Skipped");
    await expect(w.steps.nth(2)).toContainText("Skipped");
    await expect(w.error).toContainText("Parse JSON:");
    await expect(w.error).toContainText("line 3");

    await expect(w.json).toHaveAttribute("aria-invalid", "true");
    const describedBy = await w.json.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toContainText("Parse JSON:");
    await expect(w.expression).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Stopped at step 1")).toBeVisible();
    await expect(w.download).toBeDisabled();
  });

  test("reports an invalid JSONPath expression against step 2", async ({ page }) => {
    const w = ui(page);
    await w.loadSample.click();
    await w.expression.fill("$.users[");

    await expect(w.steps.nth(0)).toContainText("Done");
    await expect(w.steps.nth(1)).toContainText("Failed");
    await expect(w.steps.nth(2)).toContainText("Skipped");
    await expect(w.error).toContainText("Select with JSONPath:");
    await expect(w.expression).toHaveAttribute("aria-invalid", "true");
    await expect(w.json).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Stopped at step 2")).toBeVisible();

    // Recovering from the error clears the live region and the CSV comes back.
    await w.expression.fill("$.users[*]");
    await expect(w.error).toBeEmpty();
    await expect(w.steps.nth(2)).toContainText("Done");
  });

  test("explains zero matches with the document's top-level keys", async ({ page }) => {
    const w = ui(page);
    await w.loadSample.click();
    await w.expression.fill("$.customers[*]");

    await expect(w.steps.nth(1)).toContainText("Failed");
    await expect(w.error).toContainText("matched nothing");
    await expect(w.error).toContainText('Top-level keys in this document: "users", "meta"');

    // Array roots get a different hint.
    await w.json.fill("[1, 2, 3]");
    await expect(w.error).toContainText("root is an array of 3 items");
  });

  test("downloads the CSV shown on screen as workflow.csv", async ({ page }) => {
    const w = ui(page);
    await w.loadSample.click();
    const shown = await w.csv.inputValue();

    const downloadPromise = page.waitForEvent("download");
    await w.download.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("workflow.csv");

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString("utf8")).toBe(shown);
  });

  test("is operable with the keyboard alone", async ({ page }) => {
    const w = ui(page);
    await w.loadSample.focus();
    await page.keyboard.press("Enter");
    await expect(w.json).not.toBeEmpty();

    await page.keyboard.press("Tab");
    await expect(w.json).toBeFocused();
    await page.keyboard.press("Tab"); // Copy expression
    await page.keyboard.press("Tab");
    await expect(w.expression).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("$.meta");
    await expect(w.steps.nth(1)).toContainText("1 match → 1 row");
    expect(await w.csv.inputValue()).toBe("total,generated\n4,2026-09-29");

    await page.keyboard.press("Tab");
    await expect(w.delimiter).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /Every user as a row/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(w.expression).toHaveValue("$.users");
    await expect(page.getByRole("button", { name: /selecting the array itself/ })).toHaveAttribute("aria-pressed", "true");
    await expect(w.steps.nth(2)).toContainText("4 rows × 7 columns");
  });

  test("never stores or sends workflow input", async ({ page, context }) => {
    const w = ui(page);
    const requests: Array<{ url: string; body: string | null }> = [];
    page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() }));

    await w.json.fill(JSON.stringify([{ secret: SENTINEL }]));
    await w.expression.fill(`$[?(@.secret == '${SENTINEL}')]`);
    await expect(w.csv).toHaveValue(`secret\n${SENTINEL}`);
    await w.download.click();
    // Let any deferred work (toasts, worker checks) settle before auditing.
    await page.waitForTimeout(500);

    const origin = new URL(page.url()).origin;
    for (const r of requests) {
      expect(r.url.startsWith(origin) || r.url.startsWith("blob:") || r.url.startsWith("data:")).toBe(true);
      expect(r.url).not.toContain(SENTINEL);
      expect(r.body ?? "").not.toContain(SENTINEL);
    }
    expect(requests.some((r) => r.body)).toBe(false);
    expect(page.url()).not.toContain(SENTINEL);

    const storage = await page.evaluate(async () => ({
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      databases: (await indexedDB.databases()).length,
    }));
    expect(storage.local).not.toContain(SENTINEL);
    expect(storage.session).not.toContain(SENTINEL);
    expect(storage.databases).toBe(0);
    expect(JSON.stringify(await context.cookies())).not.toContain(SENTINEL);

    await page.reload();
    await expect(w.json).toBeEmpty();
    await expect(w.expression).toHaveValue("$.users[*]");
  });
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("stacks the panels without horizontal scrolling and stays usable", async ({ page }) => {
    await page.goto(ROUTE);
    const w = ui(page);
    await w.loadSample.tap();
    await expect(w.csv).not.toBeEmpty();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const [json, expr, csv] = await Promise.all([w.json.boundingBox(), w.expression.boundingBox(), w.csv.boundingBox()]);
    expect(json && expr && csv).toBeTruthy();
    // Single column: JSON input, then the expression, then the CSV, each spanning the width.
    expect(json!.y).toBeLessThan(expr!.y);
    expect(expr!.y).toBeLessThan(csv!.y);
    for (const box of [json!, expr!, csv!]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.width).toBeGreaterThan(250);
    }
    await w.download.scrollIntoViewIfNeeded();
    await expect(w.download).toBeVisible();
    await expect(w.copyCsv).toBeVisible();
  });
});

test.describe("offline", () => {
  test("serves a previously visited workflow page from the service worker cache", async ({ page, context }) => {
    await page.goto(ROUTE);
    // Production registers /sw.js; wait until it controls the page (the app reloads once on claim).
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30_000 });
    // A controlled load caches the page and its static chunks.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    await context.setOffline(true);
    try {
      await page.goto(ROUTE);
      await expect(page.getByRole("heading", { level: 1, name: "Workflow: JSON → CSV" })).toBeVisible();
      await expect(page.getByText("Offline", { exact: true })).toBeVisible();
      const w = ui(page);
      await w.loadSample.click();
      expect((await w.csv.inputValue()).split("\n")[0]).toBe(SAMPLE_HEADER);
    } finally {
      await context.setOffline(false);
    }
  });
});
