import { test, expect } from "@playwright/test";
import { loginPage } from "./auth.js";

const FRONTEND = "http://localhost:5173";

async function login(page) {
  await loginPage(page, FRONTEND);
  await page.goto(`${FRONTEND}/dashboard`);
  await expect(page.locator("text=Freeze Test").first()).toBeVisible();
}

async function openGallery(page) {
  await page.locator('[data-testid="album-card-photo"]').first().click();
  await expect(page.locator('[data-testid="album-gallery"]').first()).toBeVisible();
}

async function dispatchTouch(page, layer, { type, point }) {
  await layer.evaluate((el, { type, point }) => {
    const touch = new Touch({
      identifier: 0,
      target: el,
      clientX: point.x,
      clientY: point.y,
      pageX: point.x,
      pageY: point.y,
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      force: 1,
    });
    const touches = type === "touchend" ? [] : [touch];
    el.dispatchEvent(new TouchEvent(type, {
      touches,
      targetTouches: touches,
      changedTouches: [touch],
      bubbles: true,
    }));
  }, { type, point });
}

async function dispatchSwipe(page, layer, { start, end }) {
  await dispatchTouch(page, layer, { type: "touchstart", point: start });
  await dispatchTouch(page, layer, { type: "touchmove", point: end });
  await dispatchTouch(page, layer, { type: "touchend", point: end });
}

async function getTrackX(page) {
  return page.locator('[data-testid="carousel-track"]').first().evaluate((el) => {
    const matrix = new WebKitCSSMatrix(getComputedStyle(el).transform);
    return matrix.m41;
  });
}

async function getContainerWidth(page) {
  return page.locator('[data-testid="gallery-touch-layer"]').first().evaluate((el) => el.clientWidth);
}

test("slow swipe advances to the next photo and ThumbStrip follows", async ({ page }) => {
  await login(page);
  await openGallery(page);

  const w = await getContainerWidth(page);
  const touchLayer = page.locator('[data-testid="gallery-touch-layer"]').first();
  const h = await page.evaluate(() => window.innerHeight);

  // Swipe left (move finger from center to near the left edge).
  const start = { x: w * 0.5, y: h * 0.5 };
  const end = { x: w * 0.05, y: h * 0.5 };
  await dispatchSwipe(page, touchLayer, { start, end });

  // Wait for spring settle.
  await page.waitForTimeout(400);

  const x = await getTrackX(page);
  // Allow a small tolerance because springs may settle slightly past target.
  expect(Math.abs(x + w)).toBeLessThan(w * 0.1);
});

test("thumb tap jumps to the selected photo", async ({ page }) => {
  await login(page);
  await openGallery(page);

  const w = await getContainerWidth(page);

  // Tap the third thumbnail. The thumb strip is inside the gallery controls.
  // We dispatch a click to the third button inside the thumb strip container.
  await page.locator('[data-testid="album-gallery"] .btn-thumb').nth(2).click();

  // Wait for spring settle.
  await page.waitForTimeout(400);

  const x = await getTrackX(page);
  expect(Math.abs(x + w * 2)).toBeLessThan(w * 0.1);
});

test("thumb strip drag switches main photo before release", async ({ page }) => {
  await login(page);
  await openGallery(page);

  const w = await getContainerWidth(page);
  const strip = page.locator('[data-testid="thumb-strip"]').first();
  const rect = await strip.boundingBox();
  const y = rect.y + rect.height / 2;
  const startX = rect.x + rect.width / 2;

  // Drag the thumbnail strip left by 60 px. This should make photo 1 the
  // centered thumbnail while the finger is still on the screen.
  await dispatchTouch(page, strip, { type: "touchstart", point: { x: startX, y } });
  await dispatchTouch(page, strip, { type: "touchmove", point: { x: startX - 60, y } });

  // The main photo should have switched instantly before touchend.
  const xAfterMove = await getTrackX(page);
  expect(Math.abs(xAfterMove + w)).toBeLessThan(w * 0.1);

  // Releasing should keep the same photo.
  await dispatchTouch(page, strip, { type: "touchend", point: { x: startX - 60, y } });
  await page.waitForTimeout(100);

  const xAfterRelease = await getTrackX(page);
  expect(Math.abs(xAfterRelease + w)).toBeLessThan(w * 0.1);
});
