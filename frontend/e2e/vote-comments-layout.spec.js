import { test, expect } from "@playwright/test";

const FRONTEND = process.env.E2E_BASE_URL || "http://localhost:5173";
const API = process.env.E2E_API_URL || "http://localhost:8000";
const INVITE = "vote-comments-layout";
const USER = { id: "comment-user", username: "Comment Tester", avatar_url: null };
const album = {
  id: "comment-album",
  title: "Comment Layout",
  description: null,
  invite_code: INVITE,
  is_active: true,
  is_public: true,
  creator: USER,
  photos: [{
    id: "comment-photo",
    filename: "photo.svg",
    url: `${FRONTEND}/comment-photo.svg`,
    media_type: "image",
    order: 0,
  }],
};

test("voting comments keep the photo above the sheet while it expands", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`${API}/api/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === `/api/albums/invite/${INVITE}`) return route.fulfill({ json: album });
    if (pathname === `/api/votes/session/${INVITE}`) return route.fulfill({ json: { voted_photo_ids: [] } });
    if (pathname === "/api/auth/me") return route.fulfill({ json: USER });
    if (pathname === "/api/notifications/") return route.fulfill({ json: [] });
    if (pathname.startsWith("/api/comments/photo/")) return route.fulfill({ json: [] });
    return route.continue();
  });
  await page.route("**/comment-photo.svg", async (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#9966cc"/></svg>`,
  }));
  await page.addInitScript(({ user }) => {
    const raw = JSON.stringify(user);
    localStorage.setItem("pickmatch_token", "comment-token");
    localStorage.setItem("pickmatch_user", raw);
  }, { user: USER });

  await page.goto(`${FRONTEND}/vote/${INVITE}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Comment Layout")).toBeVisible();
  await page.getByTestId("vote-comment-button").click();

  const sheet = page.getByTestId("vote-comments-sheet");
  const panel = page.getByTestId("vote-comments-sheet-panel");
  const photoStage = page.getByTestId("vote-comments-sheet-top-content");
  const photo = photoStage.locator("img");
  await expect(sheet).toBeVisible();
  await expect(photo).toBeVisible();
  await expect(page.getByText("Комментарии")).toBeVisible();
  await expect(page.getByTestId("vote-comments-sheet-content")).toBeVisible();
  await page.waitForTimeout(700);

  const partialPanel = await panel.boundingBox();
  const partialStage = await photoStage.boundingBox();
  const partialPhoto = await photo.boundingBox();
  expect(partialPanel).not.toBeNull();
  expect(partialStage).not.toBeNull();
  expect(partialPhoto).not.toBeNull();
  expect(partialStage.y + partialStage.height).toBeLessThanOrEqual(partialPanel.y + 2);

  const handle = page.getByTestId("vote-comments-sheet-handle");
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 260, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const fullPanel = await panel.boundingBox();
  const fullStage = await photoStage.boundingBox();
  const fullPhoto = await photo.boundingBox();
  expect(fullPanel).not.toBeNull();
  expect(fullStage).not.toBeNull();
  expect(fullPhoto).not.toBeNull();
  expect(fullStage.y + fullStage.height).toBeGreaterThan(fullPanel.y);
  expect(fullPhoto.height).toBeGreaterThan(0);
  expect(fullStage.height).toBeGreaterThanOrEqual(partialStage.height - 2);
  expect(fullPanel.y).toBeLessThan(partialPanel.y);
  expect(fullPanel.y).toBeLessThan(fullStage.y + fullStage.height);
  expect(fullPanel.y).toBeGreaterThanOrEqual(0);
  expect(fullPanel.y + fullPanel.height).toBeLessThanOrEqual(page.viewportSize().height + 1);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden({ timeout: 2_000 });
  await expect(page.locator('[data-testid="vote-comment-button"]')).toBeVisible();
  const cardImage = page.locator('[data-testid="vote-pinch-image"] img').first();
  await expect(cardImage).toBeVisible();
  await expect(cardImage).toHaveCSS("opacity", "1");
});
