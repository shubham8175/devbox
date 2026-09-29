import { expect, test, type Page } from "@playwright/test";

/**
 * IP Location is the one tool that talks to other servers, so it is exercised
 * against the production build with the service worker in control: the CSP
 * must allow the hosts, the worker must let cross-origin requests through, and
 * the page must still load and answer reserved addresses while offline.
 */
const ROUTE = "/tools/ip-lookup";

const IPWHOIS = {
  ip: "8.8.8.8",
  success: true,
  type: "IPv4",
  continent: "North America",
  country: "United States",
  country_code: "US",
  region: "California",
  region_code: "CA",
  city: "San Jose",
  latitude: 37.34,
  longitude: -121.89,
  postal: "95025",
  calling_code: "1",
  capital: "Washington D.C.",
  flag: { emoji: "🇺🇸" },
  connection: { asn: 15169, org: "Google LLC", isp: "Google LLC", domain: "google.com" },
  timezone: { id: "America/Los_Angeles", offset: -25200, utc: "-07:00" },
};

const IPINFO = { ip: "8.8.8.8", hostname: "dns.google", city: "Mountain View", region: "California", country: "US", loc: "38.0,-122.1", org: "AS15169 Google LLC", postal: "94043", timezone: "America/Los_Angeles" };

async function waitForWorker(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30_000 });
}

async function warm(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        navigator.serviceWorker.controller!.postMessage("WARM_CACHE", [channel.port2]);
      }),
  );
}

async function lookup(page: Page, address: string) {
  await page.locator("#ip-lookup-in").fill(address);
  await page.locator("#ip-lookup-in").press("Enter");
}

/** An OutputRow (root has class "group") by its label. */
const row = (page: Page, label: string) => page.locator("div.group", { has: page.getByText(label, { exact: true }) });

test.describe("IP Location", () => {
  test("production headers allow exactly the lookup hosts", async ({ request }) => {
    const res = await request.get(ROUTE);
    const csp = res.headers()["content-security-policy"] ?? "";
    const connect = /connect-src ([^;]+)/.exec(csp)?.[1] ?? "";
    expect(connect.split(" ").sort()).toEqual(["'self'", "https://api.ipify.org", "https://api64.ipify.org", "https://ipinfo.io", "https://ipwho.is"].sort());
  });

  test("sends nothing while typing and looks up on Enter, with the worker in control", async ({ page, context }) => {
    const external: string[] = [];
    context.on("request", (r) => {
      if (!r.url().startsWith("http://localhost")) external.push(r.url());
    });
    await context.route("https://ipwho.is/**", (route) => route.fulfill({ json: IPWHOIS }));

    await page.goto(ROUTE);
    await waitForWorker(page);
    await page.locator("#ip-lookup-in").fill("8.8.8.8");
    await page.waitForTimeout(500);
    expect(external).toEqual([]);

    await page.locator("#ip-lookup-in").press("Enter");
    await expect(page.getByText("San Jose, California, United States")).toBeVisible();
    await expect(page.getByText("via ipwho.is")).toBeVisible();
    await expect(row(page, "ISP")).toContainText("Google LLC");
    await expect(row(page, "Timezone")).toContainText("America/Los_Angeles");
    await expect(row(page, "ASN")).toContainText("AS15169");
    expect(external).toEqual(["https://ipwho.is/8.8.8.8"]);
  });

  test("falls back to ipinfo.io when ipwho.is fails", async ({ page, context }) => {
    await context.route("https://ipwho.is/**", (route) => route.fulfill({ status: 500, body: "" }));
    await context.route("https://ipinfo.io/**", (route) => route.fulfill({ json: IPINFO }));
    await page.goto(ROUTE);
    await waitForWorker(page);
    await lookup(page, "8.8.8.8");
    await expect(page.getByText("Mountain View, California, United States")).toBeVisible();
    await expect(page.getByText("via ipinfo.io")).toBeVisible();
    await expect(row(page, "Hostname (reverse DNS)")).toContainText("dns.google");
  });

  test("reports when both services fail", async ({ page, context }) => {
    await context.route("https://ipwho.is/**", (route) => route.fulfill({ status: 429, json: {} }));
    await context.route("https://ipinfo.io/**", (route) => route.abort());
    await page.goto(ROUTE);
    await lookup(page, "8.8.8.8");
    await expect(page.getByText("Both lookup services failed.")).toBeVisible();
    await expect(page.getByText(/ipwho\.is: rate limit/)).toBeVisible();
  });

  test("Detect my IP asks ipify and looks the IPv4 up", async ({ page, context }) => {
    await context.route("https://api.ipify.org/**", (route) => route.fulfill({ json: { ip: "203.0.113.9" } }));
    await context.route("https://api64.ipify.org/**", (route) => route.fulfill({ json: { ip: "2001:db8:1::9" } }));
    await context.route("https://ipwho.is/**", (route) => route.fulfill({ json: { ...IPWHOIS, ip: "203.0.113.9", city: "Bengaluru", region: "Karnataka", country: "India", country_code: "IN" } }));
    await page.goto(ROUTE);
    await waitForWorker(page);
    await page.getByRole("button", { name: "Detect my IP" }).click();
    await expect(page.getByRole("button", { name: "203.0.113.9" })).toBeVisible();
    await expect(page.getByRole("button", { name: "2001:db8:1::9" })).toBeVisible();
    await expect(page.locator("#ip-lookup-in")).toHaveValue("203.0.113.9");
    await expect(page.getByText("Bengaluru, Karnataka, India")).toBeVisible();
  });

  test("reserved addresses are answered locally without any request", async ({ page, context }) => {
    const external: string[] = [];
    context.on("request", (r) => {
      if (!r.url().startsWith("http://localhost")) external.push(r.url());
    });
    await page.goto(ROUTE);
    await lookup(page, "192.168.1.4");
    await expect(page.getByText("Private (RFC 1918)", { exact: true })).toBeVisible();
    await expect(page.getByText(/Nothing was sent/)).toBeVisible();
    await lookup(page, "fe80::1");
    await expect(page.getByText(/Link-local/)).toBeVisible();
    expect(external).toEqual([]);
  });

  test("offline: the page opens from the cache, reserved addresses still work, public ones explain", async ({ page, context }) => {
    await page.goto(ROUTE);
    await waitForWorker(page);
    await warm(page);
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole("heading", { name: "IP Location" })).toBeVisible();
      await expect(page.getByText(/You are offline/)).toBeVisible();
      await lookup(page, "10.1.2.3");
      await expect(page.getByText("Private (RFC 1918)", { exact: true })).toBeVisible();
      await lookup(page, "8.8.8.8");
      await expect(page.getByText(/You are offline\. Looking up an address needs a connection/)).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("real network: resolves a public address end to end", async ({ page, request }) => {
    const reachable = await request.get("https://ipwho.is/8.8.8.8", { timeout: 10_000 }).then((r) => r.ok(), () => false);
    test.skip(!reachable, "ipwho.is not reachable from this machine");
    await page.goto(ROUTE);
    await waitForWorker(page);
    await lookup(page, "8.8.8.8");
    await expect(row(page, "Country")).toContainText("United States", { timeout: 20_000 });
    await expect(row(page, "ASN")).toContainText("AS15169");
  });
});
