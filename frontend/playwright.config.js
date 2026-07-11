import { defineConfig } from "@playwright/test";

/**
 * Playwright config for PicMatch SPA smoke tests.
 *
 * Local dev: starts `npm run dev` (Vite at :5173) and runs tests against it.
 * CI: assumes preview server is already up at the configured baseURL.
 *
 * Chromium-only for now — Firefox/Webkit can be added to the `projects` array
 * once we need cross-browser coverage. Adding all three increases install time
 * by ~3x and CI runtime by ~2x; for an MVP a single engine catches the bulk
 * of regressions.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Mobile-first viewport: PicMatch is a swipe-voting app whose primary
    // surface is a phone. Desktop-only tests would miss real bugs.
    viewport: { width: 390, height: 844 },
  },

  // Auto-start Vite dev server when running locally. In CI, set
  // E2E_BASE_URL=https://<preview-deploy>.vercel.app to skip the dev server.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
