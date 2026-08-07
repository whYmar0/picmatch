import { test, expect } from "@playwright/test";

const FRONTEND = process.env.E2E_BASE_URL || "http://localhost:5173";
const API = process.env.E2E_API_URL || "http://localhost:8000";
const TOKEN = "album-stats-rework-test-token";
const USER = {
  id: "album-stats-rework-user",
  email: "stats@example.com",
  username: "Stats Tester",
  role: "creator",
  is_verified: true,
};

const photos = Array.from({ length: 12 }, (_, index) => ({
  id: `stats-photo-${index}`,
  filename: `photo-${index}.svg`,
  url: `${FRONTEND}/stats-photo-${index}.svg`,
  media_type: "image",
  order: index,
  created_at: "2026-01-01T00:00:00Z",
}));

const album = {
  id: "album-stats-rework",
  title: "Album Statistics Rework",
  description: null,
  invite_code: "album-stats-rework",
  invite_url: `${FRONTEND}/vote/album-stats-rework`,
  is_active: true,
  is_public: true,
  photo_count: photos.length,
  total_votes: photos.length,
  created_at: "2026-01-01T00:00:00Z",
  creator: USER,
  creator_id: USER.id,
  photos,
};

const analytics = {
  id: album.id,
  title: album.title,
  description: null,
  creator_id: USER.id,
  creator: USER,
  is_public: true,
  total_photos: photos.length,
  total_votes: photos.length,
  unique_voters: 1,
  global_like_rate: 100,
  voter_summaries: [],
  photos: photos.map((photo) => ({
    ...photo,
    like_count: 1,
    dislike_count: 0,
    total_votes: 1,
    like_percentage: 100,
    is_winner: photo.order === 0,
    reactions: [],
  })),
  winner: null,
  created_at: album.created_at,
  is_shared: false,
  can_view_stats: true,
};

async function setup(page) {
  await page.route(`${API}/api/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/auth/me") return route.fulfill({ json: USER });
    if (pathname === "/api/albums/my") return route.fulfill({ json: [album] });
    if (pathname === `/api/albums/${album.id}/analytics`) return route.fulfill({ json: analytics });
    if (pathname.startsWith("/api/comments/photo/")) return route.fulfill({ json: [] });
    if (pathname === "/api/notifications/") return route.fulfill({ json: [] });
    return route.continue();
  });

  for (const photo of photos) {
    await page.route(`**/stats-photo-${photo.order}.svg`, async (route) => route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#9966cc"/><text x="200" y="150" text-anchor="middle" fill="white" font-size="48">${photo.order + 1}</text></svg>`,
    }));
  }

  await page.addInitScript(({ token, user }) => {
    const raw = JSON.stringify(user);
    localStorage.setItem("pickmatch_token", token);
    localStorage.setItem("pickmatch_user", raw);
    sessionStorage.setItem("pickmatch_token", token);
    sessionStorage.setItem("pickmatch_user", raw);
  }, { token: TOKEN, user: USER });

  await page.goto(`${FRONTEND}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: album.title })).toBeVisible();
  await page.locator('[data-testid="album-card-photo"]').first().click();
  await expect(page.locator('[data-testid="album-gallery"]')).toBeVisible();
}

async function swipeUp(page, locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const x = box.x + box.width / 2;
  const startY = box.y + box.height * 0.75;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.mouse.move(x, startY - 100, { steps: 4 });
  await page.mouse.up();
  // Pointer swipe is the desktop equivalent of a touch swipe. The click path
  // is intentionally used as a fallback only if the browser did not expose
  // pointer capture for the synthetic drag.
}

async function progressiveSwipeUp(page, locator, distance = 72, release = true) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const x = box.x + box.width / 2;
  const startY = box.y + box.height * 0.75;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.mouse.move(x, startY - distance, { steps: 6 });
  if (release) await page.mouse.up();
}

async function horizontalSwipe(page, locator, direction = "left") {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const y = box.y + Math.min(80, box.height / 2);
  const startX = box.x + box.width / 2;
  const endX = startX + (direction === "left" ? -120 : 120);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 4 });
  await page.mouse.up();
}

test.describe("Extended album statistics BottomSheet", () => {
  test("supports swipe-up open, safe photo stage, tab swipe, grid, list scroll, and photo navigation", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text());
    });

    await setup(page);
    const pill = page.getByTestId("gallery-pill-bar");
    const viewportHeight = page.viewportSize().height;
    await progressiveSwipeUp(page, pill, 300, false);
    const progressivePanel = page.getByTestId("primary-stats-sheet-panel");
    await expect(progressivePanel).toBeVisible();
    const progressiveBox = await progressivePanel.boundingBox();
    expect(progressiveBox).not.toBeNull();
    expect(progressiveBox.y).toBeGreaterThan(0);
    expect(progressiveBox.y).toBeLessThan(viewportHeight);
    await page.mouse.up();

    const sheet = page.getByTestId("primary-stats-sheet");
    const sheetPanel = page.getByTestId("primary-stats-sheet-panel");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(700);
    await expect(sheetPanel).toBeVisible();
    await expect(sheet.locator(".backdrop-blur-xl")).toHaveCount(0);
    const primaryBackdrop = sheet.locator('[data-testid="primary-stats-sheet-backdrop"]');
    await expect(primaryBackdrop).toHaveAttribute("data-dim", "false");
    await expect.poll(() => primaryBackdrop.evaluate((node) => {
      const style = getComputedStyle(node);
      return `${style.backgroundColor}|${style.backdropFilter}`;
    })).toBe("rgba(0, 0, 0, 0)|none");

    const photoStage = page.getByTestId("gallery-touch-layer");
    const stageBox = await photoStage.boundingBox();
    const sheetBox = await sheetPanel.boundingBox();
    expect(stageBox).not.toBeNull();
    expect(sheetBox).not.toBeNull();
    expect(stageBox.y + stageBox.height).toBeLessThanOrEqual(sheetBox.y + 2);
    await expect(photoStage.locator("img").first()).toHaveClass(/object-contain/);

    const tabs = sheet.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await horizontalSwipe(page, sheet.locator('[data-testid="primary-stats-sheet-content"]'));
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await horizontalSwipe(page, sheet.locator('[data-testid="primary-stats-sheet-content"]'), "right");
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");

    await sheet.getByTestId("stats-sort").click();
    const gridChoice = page.getByTestId("sort-grid");
    await expect(gridChoice).toBeVisible();
    await gridChoice.click();
    const gridPhoto = sheet.getByTestId("stats-photo-0");
    await expect(gridPhoto).toHaveClass(/!rounded-2xl/);
    await expect(gridPhoto).not.toHaveClass(/rounded-full/);
    await expect(gridPhoto).toHaveCSS("border-radius", "16px");

    const floatingPill = page.getByTestId("gallery-pill-bar");
    await expect(floatingPill).toBeVisible();
    const floatingBox = await floatingPill.boundingBox();
    const gridSheetBox = await sheetPanel.boundingBox();
    expect(floatingBox).not.toBeNull();
    expect(gridSheetBox).not.toBeNull();
    expect(floatingBox.y + floatingBox.height).toBeLessThanOrEqual(gridSheetBox.y + 2);

    const handle = page.getByTestId("primary-stats-sheet-handle");
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();

    // Expand fully, then a small downward drag returns to partial without
    // closing. A second large/fast drag closes the sheet completely.
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 8);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 140, { steps: 1 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await expect(sheetPanel).toBeVisible();
    const expandedPanelBox = await sheetPanel.boundingBox();
    expect(expandedPanelBox).not.toBeNull();
    expect(expandedPanelBox.y).toBeGreaterThanOrEqual(-1);

    const expandedHandleBox = await handle.boundingBox();
    expect(expandedHandleBox).not.toBeNull();
    await page.waitForTimeout(150);
    await page.mouse.move(expandedHandleBox.x + expandedHandleBox.width / 2, expandedHandleBox.y + 8);
    await page.mouse.down();
    await page.mouse.move(expandedHandleBox.x + expandedHandleBox.width / 2, expandedHandleBox.y + 22, { steps: 4 });
    await page.waitForTimeout(180);
    await page.mouse.move(expandedHandleBox.x + expandedHandleBox.width / 2, expandedHandleBox.y + 40, { steps: 4 });
    await page.waitForTimeout(180);
    await page.mouse.up();
    await page.waitForTimeout(500);
    await expect(sheetPanel).toBeVisible();

    const partialHandleBox = await handle.boundingBox();
    expect(partialHandleBox).not.toBeNull();
    await page.mouse.move(partialHandleBox.x + partialHandleBox.width / 2, partialHandleBox.y + 8);
    await page.mouse.down();
    await page.mouse.move(partialHandleBox.x + partialHandleBox.width / 2, partialHandleBox.y - 140, { steps: 1 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const expandedAgainBox = await handle.boundingBox();
    expect(expandedAgainBox).not.toBeNull();
    await page.mouse.move(expandedAgainBox.x + expandedAgainBox.width / 2, expandedAgainBox.y + 8);
    await page.mouse.down();
    await page.mouse.move(expandedAgainBox.x + expandedAgainBox.width / 2, expandedAgainBox.y + 220, { steps: 1 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();
    await pill.click();
    await expect(sheetPanel).toBeVisible();

    await sheet.getByTestId("primary-stats-sheet-content").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(sheet.getByTestId("stats-photo-11")).toBeVisible();
    await expect(sheet.getByTestId("primary-stats-sheet-content")).not.toContainText("#");

    const lastPhoto = sheet.getByTestId("stats-photo-11");
    await lastPhoto.click();
    // Selecting a statistic photo keeps the primary sheet open, immediately
    // switches the carousel, and preserves the adapted partial snap point.
    await expect(sheetPanel).toBeVisible();
    await expect(page.locator('[data-media-id="stats-photo-11"][data-active="true"]')).toBeVisible();
    await expect(lastPhoto).toHaveClass(/ring-2/);
    const adaptedStageBox = await photoStage.boundingBox();
    const adaptedSheetBox = await sheetPanel.boundingBox();
    expect(adaptedStageBox).not.toBeNull();
    expect(adaptedSheetBox).not.toBeNull();
    expect(adaptedStageBox.y + adaptedStageBox.height).toBeLessThanOrEqual(adaptedSheetBox.y + 2);

    expect(errors, `Browser errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
