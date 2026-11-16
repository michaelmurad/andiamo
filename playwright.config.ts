import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Smoke tests against a production build. The model is stubbed out by pointing the Anthropic SDK at a closed
 * port: every model call fails fast, so the trip page takes its real fallback path (the scheduler without a
 * shortlist). No paid calls, and the plan only depends on the dataset and the URL.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      // Set here, so they win over any .env.local with a real key.
      ANTHROPIC_API_KEY: "e2e-no-model",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:9",
    },
  },
});
