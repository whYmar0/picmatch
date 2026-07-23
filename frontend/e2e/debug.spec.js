import { test, expect } from "@playwright/test";

const API = "http://localhost:8000";
const FRONTEND = "http://localhost:5173";

test("capture gallery open error", async ({ page }) => {
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message, err.stack));
  page.on("console", (msg) => console.log(`[${msg.type()}]`, msg.text()));

  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "tester@example.com", password: "Test1234!A" }),
  });
  const { access_token, user } = await res.json();

  await page.goto(`${FRONTEND}/login`);
  await page.evaluate(({ token, userObj }) => {
    const raw = JSON.stringify(userObj);
    localStorage.setItem("pickmatch_token", token);
    localStorage.setItem("pickmatch_user", raw);
    sessionStorage.setItem("pickmatch_token", token);
    sessionStorage.setItem("pickmatch_user", raw);
  }, { token: access_token, userObj: user });

  await page.goto(`${FRONTEND}/dashboard`);
  await expect(page.locator("text=Freeze Test").first()).toBeVisible();
  await page.locator('[data-testid="album-card-photo"]').first().click();
  await page.waitForTimeout(1000);
  await expect(page.locator('[data-testid="album-gallery"]').first()).toBeVisible();
});
