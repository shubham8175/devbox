import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against the production build (`next start`), because the
 * service worker is only registered in production and the security headers
 * from next.config.ts apply there. Set PW_SKIP_BUILD=1 to reuse an existing
 * `.next` build when iterating on the tests themselves.
 */
const PORT = 3457;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.PW_SKIP_BUILD ? `npm run start -- -p ${PORT}` : `npm run build && npm run start -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
