/**
 * e2e/smoke.spec.js — first Playwright spec for PicMatch SPA.
 *
 * Smoke tests are the cheapest way to catch regressions in routing,
 * bundle loading, and core UI rendering. They DO NOT replace the backend
 * pytest suite — those test API contracts; these test that the frontend
 * actually loads, parses, and runs without errors.
 *
 * Future tests (next round):
 *   • auth.spec.js  — register → verify (mock) → login → /me
 *   • voting.spec.js — open album → swipe photos → see vote count update
 *   • share.spec.js  — open /shared/{token} without auth → see album
 */
import { test, expect } from "@playwright/test";

/**
 * Captures page errors and uncaught console.error events into the array.
 * Returns the array so the test can assert on it after navigation.
 * Filters Vite dev HMR noise + favicon 404s which are benign in dev mode.
 */
function attachErrorCapture(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("[vite]") && !text.includes("favicon")) {
        errors.push(`console.error: ${text}`);
      }
    }
  });
  return errors;
}

test.describe("Smoke — page loads", () => {
  test("home page renders without console errors", async ({ page }) => {
    const errors = attachErrorCapture(page);

    await page.goto("/");
    await expect(page).toHaveTitle(/Pickmatch/i);
    // Landing's <h1> contains the product title and the CTA is a Link with
    // accessible text "Get started" (i18n'd). Both confirm React rendered
    // real content, not just an empty #root or a Suspense fallback.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("link", { name: /get started/i }),
    ).toBeVisible();

    expect(errors, `Console errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("login page shows email + password fields", async ({ page }) => {
    const errors = attachErrorCapture(page);
    await page.goto("/login");
    // PicMatch forms use <label> text + placeholder, but the <label> is
    // NOT associated via htmlFor=id, so getByLabel() would fail. Placeholders
    // are stable enough for a smoke test and are visible in markup.
    // (Long-term: add htmlFor=id to the labels for proper a11y.)
    await expect(page.getByPlaceholder(/you@example\.com/i)).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    expect(errors, `Console errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("register page shows username + email + password fields", async ({ page }) => {
    const errors = attachErrorCapture(page);
    await page.goto("/register");
    await expect(page.getByPlaceholder(/coolphotographer/i)).toBeVisible();
    await expect(page.getByPlaceholder(/you@example\.com/i)).toBeVisible();
    await expect(page.getByPlaceholder(/create password/i)).toBeVisible();
    expect(errors, `Console errors: ${errors.join("\n")}`).toEqual([]);
  });
});
