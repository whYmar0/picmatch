# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.js >> Smoke — page loads >> home page renders without console errors
- Location: e2e\smoke.spec.js:36:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('link', { name: /get started/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('link', { name: /get started/i })

```

```yaml
- banner:
  - link "Pickmatch Logo Pickmatch":
    - /url: /
    - img "Pickmatch Logo"
    - text: Pickmatch
  - link "Войти":
    - /url: /login
  - link "Регистрация":
    - /url: /register
- main:
  - heading "Выбери лучшее фото." [level=1]
  - paragraph: Вправо — нравится, влево — нет. Быстро и удобно!
  - link "Начать":
    - /url: /register
    - text: Начать
    - img
  - img
  - img
  - img
  - heading "Как это работает" [level=2]
  - img
  - heading "Загрузи альбом" [level=3]
  - paragraph: Добавь фотографии и получи ссылку.
  - img
  - heading "Поделись и собери голоса" [level=3]
  - paragraph: Отправь ссылку своей аудитории.
  - img
  - heading "Узнай победителя" [level=3]
  - paragraph: Фото с наибольшим числом лайков побеждает!
```

# Test source

```ts
  1  | /**
  2  |  * e2e/smoke.spec.js — first Playwright spec for PicMatch SPA.
  3  |  *
  4  |  * Smoke tests are the cheapest way to catch regressions in routing,
  5  |  * bundle loading, and core UI rendering. They DO NOT replace the backend
  6  |  * pytest suite — those test API contracts; these test that the frontend
  7  |  * actually loads, parses, and runs without errors.
  8  |  *
  9  |  * Future tests (next round):
  10 |  *   • auth.spec.js  — register → verify (mock) → login → /me
  11 |  *   • voting.spec.js — open album → swipe photos → see vote count update
  12 |  *   • share.spec.js  — open /shared/{token} without auth → see album
  13 |  */
  14 | import { test, expect } from "@playwright/test";
  15 | 
  16 | /**
  17 |  * Captures page errors and uncaught console.error events into the array.
  18 |  * Returns the array so the test can assert on it after navigation.
  19 |  * Filters Vite dev HMR noise + favicon 404s which are benign in dev mode.
  20 |  */
  21 | function attachErrorCapture(page) {
  22 |   const errors = [];
  23 |   page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  24 |   page.on("console", (msg) => {
  25 |     if (msg.type() === "error") {
  26 |       const text = msg.text();
  27 |       if (!text.includes("[vite]") && !text.includes("favicon")) {
  28 |         errors.push(`console.error: ${text}`);
  29 |       }
  30 |     }
  31 |   });
  32 |   return errors;
  33 | }
  34 | 
  35 | test.describe("Smoke — page loads", () => {
  36 |   test("home page renders without console errors", async ({ page }) => {
  37 |     const errors = attachErrorCapture(page);
  38 | 
  39 |     await page.goto("/");
  40 |     await expect(page).toHaveTitle(/Pickmatch/i);
  41 |     // Landing's <h1> contains the product title and the CTA is a Link with
  42 |     // accessible text "Get started" (i18n'd). Both confirm React rendered
  43 |     // real content, not just an empty #root or a Suspense fallback.
  44 |     await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
  45 |       timeout: 5_000,
  46 |     });
  47 |     await expect(
  48 |       page.getByRole("link", { name: /get started/i }),
> 49 |     ).toBeVisible();
     |       ^ Error: expect(locator).toBeVisible() failed
  50 | 
  51 |     expect(errors, `Console errors: ${errors.join("\n")}`).toEqual([]);
  52 |   });
  53 | 
  54 |   test("login page shows email + password fields", async ({ page }) => {
  55 |     const errors = attachErrorCapture(page);
  56 |     await page.goto("/login");
  57 |     // PicMatch forms use <label> text + placeholder, but the <label> is
  58 |     // NOT associated via htmlFor=id, so getByLabel() would fail. Placeholders
  59 |     // are stable enough for a smoke test and are visible in markup.
  60 |     // (Long-term: add htmlFor=id to the labels for proper a11y.)
  61 |     await expect(page.getByPlaceholder(/you@example\.com/i)).toBeVisible();
  62 |     await expect(page.locator('input[type="password"]')).toBeVisible();
  63 |     expect(errors, `Console errors: ${errors.join("\n")}`).toEqual([]);
  64 |   });
  65 | 
  66 |   test("register page shows username + email + password fields", async ({ page }) => {
  67 |     const errors = attachErrorCapture(page);
  68 |     await page.goto("/register");
  69 |     await expect(page.getByPlaceholder(/coolphotographer/i)).toBeVisible();
  70 |     await expect(page.getByPlaceholder(/you@example\.com/i)).toBeVisible();
  71 |     await expect(page.getByPlaceholder(/create password/i)).toBeVisible();
  72 |     expect(errors, `Console errors: ${errors.join("\n")}`).toEqual([]);
  73 |   });
  74 | });
  75 | 
```