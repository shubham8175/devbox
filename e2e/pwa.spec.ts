import { expect, test, type Page } from "@playwright/test";

const ROUTE = "/tools/workflow-json-csv";

/** The registered worker controls the page once it has activated and claimed it (no reload needed). */
async function waitForWorker(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30_000 });
}

/**
 * Background warming (see scripts/build-sw.mjs) caches every tool page and the
 * build assets it references. Ask the worker to warm (it dedupes against the run
 * the page already triggered) and wait for its "done" reply on a MessageChannel.
 */
async function waitForWarm(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        navigator.serviceWorker.controller!.postMessage("WARM_CACHE", [channel.port2]);
      }),
  );
}

/** Sanity check on the warm: the page and every script/stylesheet it references are in CacheStorage. */
async function expectPageCached(page: Page, pathname: string) {
  await page.waitForFunction(
    async (p) => {
      const html = await caches.match(p);
      if (!html) return false;
      const assets = (await html.text()).match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [];
      if (!assets.length) return false;
      for (const asset of new Set(assets)) if (!(await caches.match(asset))) return false;
      return true;
    },
    pathname,
    { timeout: 10_000 },
  );
}

test.describe("installable web app", () => {
  test("links a valid manifest with icons, shortcuts and the iOS install tags", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();

    const res = await request.get(href!);
    expect(res.ok()).toBe(true);
    expect(res.headers()["content-type"]).toContain("manifest");
    const manifest = await res.json();
    expect(manifest.name).toBe("DevBox");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.share_target.method).toBe("GET");
    expect(manifest.share_target.action).toBe("/tools/qr");

    expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toEqual(["any", "any", "maskable", "maskable"]);
    for (const icon of manifest.icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.ok(), icon.src).toBe(true);
      expect(iconRes.headers()["content-type"]).toBe("image/png");
    }
    for (const shortcut of manifest.shortcuts) expect((await request.get(shortcut.url)).ok(), shortcut.url).toBe(true);

    await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "DevBox");
  });

  test("serves the service worker uncached, with every tool route baked in", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBe(true);
    expect(res.headers()["content-type"]).toContain("javascript");
    expect(res.headers()["cache-control"]).toContain("no-cache");
    const body = await res.text();
    expect(body).toContain(`"${ROUTE}"`);
    expect(body).toContain('"/tools/epoch"');
    expect(body).toContain('"/offline"');
  });

  test("offers an install action in the sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Install as app" })).toBeVisible();
  });
});

test.describe("offline", () => {
  test("serves a visited tool from the cache and it keeps working", async ({ page, context }) => {
    await page.goto(ROUTE);
    await waitForWorker(page);
    await waitForWarm(page);
    await expectPageCached(page, ROUTE);

    await context.setOffline(true);
    try {
      await page.goto(ROUTE);
      await expect(page.getByRole("heading", { level: 1, name: "Workflow: JSON → CSV" })).toBeVisible();
      await expect(page.getByText("Offline", { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "Load sample" }).click();
      await expect(page.getByLabel("CSV output")).toHaveValue(/^id,name,email/);
    } finally {
      await context.setOffline(false);
    }
  });

  test("opens a tool that was never visited, and shows the offline page for unknown URLs", async ({ page, context }) => {
    await page.goto("/");
    await waitForWorker(page);
    await waitForWarm(page);
    await expectPageCached(page, "/tools/epoch");

    await context.setOffline(true);
    try {
      await page.goto("/tools/epoch");
      await expect(page.getByRole("heading", { level: 1, name: "Epoch Converter" })).toBeVisible();
      await page.getByRole("button", { name: "Load sample" }).click();
      await expect(page.getByLabel("Timestamp or date")).not.toHaveValue("");
      await expect(page.getByText("ISO 8601", { exact: true })).toBeVisible();

      await page.goto(`/tools/not-a-tool-${Date.now()}`);
      await expect(page.getByRole("heading", { level: 1, name: "You're offline" })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
