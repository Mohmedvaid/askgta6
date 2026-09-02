import { defineConfig, devices } from "@playwright/test";

const port = 3100;

// Some sandboxes ship a Chromium that does not match the bundled revision.
// PLAYWRIGHT_CHROMIUM_EXECUTABLE points at the one that is actually installed.
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
  : {};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `http://127.0.0.1:${port}/auth/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
