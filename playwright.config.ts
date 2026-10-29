import { defineConfig } from "@playwright/test";

const api = `DATA_DIR=/tmp/elfin-ui-pw-${Date.now()} DEMO_CATALOG=1 JWT_SECRET=elfin-qa-ui TELEGRAM_BOT_TOKEN=elfin-qa-ui-bot PORT=8787 node server/index.js`;

export default defineConfig({
  testDir: "tests/ui",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: api,
      url: "http://127.0.0.1:8787/api/health",
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 20_000,
    },
  ],
});
