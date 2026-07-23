import { test, expect } from "@playwright/test";
import { loginPage } from "./auth.js";

const FRONTEND = "http://localhost:5173";

test("gallery close from non-first photo does not freeze dashboard", async ({ page }) => {
  page.on("console", (msg) => console.log("[browser]", msg.type(), msg.text()));
  await loginPage(page, FRONTEND);

  await page.goto(`${FRONTEND}/dashboard`);
  await expect(page.locator("text=Freeze Test").first()).toBeVisible();

  // Open the gallery from the first album card.
  await page.locator('[data-testid="album-card-photo"]').first().click();
  await expect(page.locator('[data-testid="album-gallery"]').first()).toBeVisible();

  // Navigate to the second photo (index 1) using the keyboard.
  await page.keyboard.press("ArrowRight");

  // Swipe down to dismiss the gallery.
  const touchLayer = page.locator('[data-testid="gallery-touch-layer"]');
  await expect(touchLayer).toBeVisible();
  await touchLayer.evaluate((el) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const start = { clientX: w / 2, clientY: h / 2, identifier: 0 };
    const end = { clientX: w / 2, clientY: h / 2 + 150, identifier: 0 };
    const mkTouch = (t) => new Touch({
      identifier: t.identifier,
      target: el,
      clientX: t.clientX,
      clientY: t.clientY,
      pageX: t.clientX,
      pageY: t.clientY,
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      force: 1,
    });
    const startTouch = mkTouch(start);
    const endTouch = mkTouch(end);
    el.dispatchEvent(new TouchEvent("touchstart", {
      touches: [startTouch],
      targetTouches: [startTouch],
      changedTouches: [startTouch],
      bubbles: true,
    }));
    el.dispatchEvent(new TouchEvent("touchmove", {
      touches: [endTouch],
      targetTouches: [endTouch],
      changedTouches: [endTouch],
      bubbles: true,
    }));
    el.dispatchEvent(new TouchEvent("touchend", {
      touches: [],
      targetTouches: [],
      changedTouches: [endTouch],
      bubbles: true,
    }));
  });

  // Wait for the exit animation to finish.
  await page.waitForTimeout(400);
  const opacity = await page.locator('[data-testid="album-gallery"]').first().evaluate((el) => getComputedStyle(el).opacity);
  console.log("gallery opacity after 400ms:", opacity);
  expect(parseFloat(opacity)).toBeLessThan(1);

  // After the gallery closes, the Dashboard must remain interactive.
  // The overlay should not block clicks to the underlying page.
  await page.locator('[data-testid="album-card-photo"]').first().click();
  await expect(page.locator('[data-testid="album-gallery"]').first()).toBeVisible();
});
