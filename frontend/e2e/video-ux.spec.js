import { test, expect } from "@playwright/test";
import fs from "node:fs";

const FRONTEND = process.env.E2E_BASE_URL || "http://localhost:5173";
const API = process.env.E2E_API_URL || "http://localhost:8000";
const VIDEO_FIXTURE = new URL("../document_5415749994122616064.mp4", import.meta.url);
const TOKEN = "video-ux-test-token";
const USER = {
  id: "video-ux-user",
  email: "video-ux@example.com",
  username: "Video UX Tester",
  role: "creator",
  avatar_url: null,
  avatar_color: "#9966CC",
  is_verified: true,
  created_at: "2026-01-01T00:00:00Z",
};

const firstVideo = {
  id: "video-ux-1",
  filename: "ux-one.mp4",
  url: `${FRONTEND}/video-ux-test.mp4`,
  media_type: "video",
  order: 0,
  created_at: "2026-01-01T00:00:00Z",
};
const secondVideo = { ...firstVideo, id: "video-ux-2", filename: "ux-two.mp4", order: 1 };
const album = {
  id: "video-ux-album",
  title: "Video UX Test",
  description: null,
  invite_code: "video-ux-test",
  invite_url: `${FRONTEND}/vote/video-ux-test`,
  is_active: true,
  is_public: true,
  photo_count: 2,
  total_votes: 0,
  created_at: "2026-01-01T00:00:00Z",
  creator: USER,
  photos: [firstVideo, secondVideo],
};
const analytics = {
  id: album.id,
  title: album.title,
  description: null,
  creator_id: USER.id,
  creator: USER,
  is_public: true,
  total_photos: 2,
  total_votes: 0,
  unique_voters: 0,
  global_like_rate: 0,
  voter_summaries: [],
  photos: album.photos.map((photo) => ({ ...photo, like_count: 0, dislike_count: 0, total_votes: 0, like_percentage: 0, is_winner: false, reactions: [] })),
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
  await page.route("**/video-ux-test.mp4", async (route) => route.fulfill({
    status: 200,
    contentType: "video/mp4",
    body: fs.readFileSync(VIDEO_FIXTURE),
  }));
  await page.addInitScript(({ token, user }) => {
    const raw = JSON.stringify(user);
    localStorage.setItem("pickmatch_token", token);
    localStorage.setItem("pickmatch_user", raw);
    sessionStorage.setItem("pickmatch_token", token);
    sessionStorage.setItem("pickmatch_user", raw);
  }, { token: TOKEN, user: USER });
  await page.goto(`${FRONTEND}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Video UX Test" })).toBeVisible();
  await page.locator('[data-testid="album-card-photo"]').click();
  await expect(page.locator('[data-testid="album-gallery"]')).toBeVisible();
}

async function touch(locator, type, x, y) {
  await locator.evaluate((el, { type: eventType, x: clientX, y: clientY }) => {
    const touch = new Touch({ identifier: 1, target: el, clientX, clientY, pageX: clientX, pageY: clientY, radiusX: 1, radiusY: 1, force: 1 });
    el.dispatchEvent(new TouchEvent(eventType, {
      touches: eventType === "touchend" ? [] : [touch],
      targetTouches: eventType === "touchend" ? [] : [touch],
      changedTouches: [touch],
      bubbles: true,
      cancelable: true,
    }));
  }, { type, x, y });
}

test("video opens muted and autoplaying, then pauses/resumes from custom controls", async ({ page }) => {
  await setup(page);
  const player = page.locator('[data-testid="gallery-shared-video"] [data-video-player="true"]').first();
  const video = player.locator("video");
  await expect(video).toHaveJSProperty("muted", true);
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);

  await player.click({ position: { x: 20, y: 20 } });
  await expect(player.getByRole("button", { name: "Pause video" })).toBeVisible();
  await player.getByRole("button", { name: "Pause video" }).click();
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  await expect(player.getByRole("button", { name: "Play video" })).toBeVisible();
  await player.getByRole("button", { name: "Play video" }).click();
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
});

test("mute control changes audio state without pausing video", async ({ page }) => {
  await setup(page);
  const player = page.locator('[data-testid="gallery-shared-video"] [data-video-player="true"]').first();
  const video = player.locator("video");
  await player.click({ position: { x: 20, y: 20 } });
  const muteButton = player.getByRole("button", { name: "Unmute video" });
  await expect(muteButton).toBeVisible();
  await muteButton.click();
  await expect(video).toHaveJSProperty("muted", false);
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
  await player.getByRole("button", { name: "Mute video" }).click();
  await expect(video).toHaveJSProperty("muted", true);

  await player.getByRole("button", { name: "Pause video" }).click();
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  await player.getByRole("button", { name: "Unmute video" }).click();
  await expect(video).toHaveJSProperty("muted", false);
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
});

test("hold pauses the video and release resumes playback", async ({ page }) => {
  await setup(page);
  const player = page.locator('[data-testid="gallery-shared-video"] [data-video-player="true"]').first();
  const video = player.locator("video");
  const box = await player.boundingBox();
  expect(box).not.toBeNull();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await touch(player, "touchstart", x, y);
  await page.waitForTimeout(220);
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  const playButton = player.getByRole("button", { name: "Play video" });
  await expect(playButton).toBeVisible();
  await expect(playButton).toHaveClass(/border-0/);
  await expect(playButton).toHaveClass(/ring-0/);
  await touch(player, "touchend", x, y);
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
});

test("bottom horizontal swipe reveals the timeline and seeks", async ({ page }) => {
  await setup(page);
  const player = page.locator('[data-testid="gallery-shared-video"] [data-video-player="true"]').first();
  const video = player.locator("video");
  const box = await player.boundingBox();
  expect(box).not.toBeNull();
  await expect.poll(() => video.evaluate((node) => Number.isFinite(node.duration) && node.duration > 0)).toBe(true);
  const y = box.y + box.height * 0.9;
  await touch(player, "touchstart", box.x + 10, y);
  await touch(player, "touchmove", box.x + box.width * 0.75, y);
  await page.waitForTimeout(100);
  await expect(player.locator('[data-video-controls="true"]')).toBeVisible();
  const timeline = player.getByRole("slider", { name: "Video progress" });
  await expect(timeline).toHaveCount(1);
  await expect(timeline).toBeVisible();
  await expect.poll(() => video.evaluate((node) => node.currentTime > 0)).toBe(true);
  await touch(player, "touchend", box.x + box.width * 0.75, y);
});

test("voting video uses the bottom 20% for scrub and blurred letterbox backdrop", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route(`${API}/api/albums/invite/video-ux-test`, async (route) => route.fulfill({ json: {
    id: "vote-video-album",
    title: "Vote Video UX Test",
    description: null,
    invite_code: "video-ux-test",
    invite_url: `${FRONTEND}/vote/video-ux-test`,
    is_active: true,
    is_public: true,
    photo_count: 1,
    total_votes: 0,
    created_at: "2026-01-01T00:00:00Z",
    creator: USER,
    photos: [{ ...firstVideo, id: "vote-video-1" }],
  }}));
  await page.route(`${API}/api/votes/session/video-ux-test`, async (route) => route.fulfill({ json: { voted_photo_ids: [] } }));
  const voteRequests = [];
  await page.route(`${API}/api/votes/`, async (route) => {
    voteRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: "vote-result" } });
  });
  await page.route(`${API}/api/auth/me`, async (route) => route.fulfill({ json: USER }));
  await page.route(`${API}/api/notifications/`, async (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/api/comments/photo/**`, async (route) => route.fulfill({ json: [] }));
  await page.route("**/video-ux-test.mp4", async (route) => route.fulfill({
    status: 200,
    contentType: "video/mp4",
    body: fs.readFileSync(VIDEO_FIXTURE),
  }));
  await page.addInitScript(({ token, user }) => {
    const raw = JSON.stringify(user);
    localStorage.setItem("pickmatch_token", token);
    localStorage.setItem("pickmatch_user", raw);
    sessionStorage.setItem("pickmatch_token", token);
    sessionStorage.setItem("pickmatch_user", raw);
  }, { token: TOKEN, user: USER });
  await page.goto(`${FRONTEND}/vote/video-ux-test`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Vote Video UX Test")).toBeVisible();
  await expect(page.getByText("Вправо — нравится · влево — не нравится")).toBeVisible();
  await expect(page.getByText("НЕ НРАВИТСЯ")).toHaveCount(1);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth);
  await expect(page.locator('[data-testid="thumbnail-edge-fade"]')).toHaveCount(2);
  const edgeFades = page.locator('[data-testid="thumbnail-edge-fade"]');
  await expect(edgeFades.nth(0)).not.toHaveClass(/backdrop-blur/);
  await expect(edgeFades.nth(1)).not.toHaveClass(/backdrop-blur/);

  const player = page.locator('[data-video-player="true"]').first();
  const video = player.locator('[data-video-main="true"]');
  const background = player.locator('[data-video-backdrop="true"]');
  await expect(player).toHaveAttribute("data-video-player", "true");
  await expect(background).toHaveCount(1);
  await expect(background).toHaveJSProperty("muted", true);
  await expect(background).toHaveClass(/object-cover/);
  await expect(background).toHaveClass(/blur-2xl/);
  await expect.poll(() => video.evaluate((node) => Number.isFinite(node.duration) && node.duration > 0)).toBe(true);

  const box = await player.boundingBox();
  expect(box).not.toBeNull();
  const startY = box.y + box.height * 0.9;
  const startX = box.x + 10;
  const endX = box.x + box.width * 0.75;
  await touch(player, "touchstart", startX, startY);
  await touch(player, "touchmove", endX, startY);
  await page.waitForTimeout(100);
  await expect(player.getByRole("slider", { name: "Video progress" })).toBeVisible();
  await expect.poll(() => video.evaluate((node) => node.currentTime > 0)).toBe(true);
  await touch(player, "touchend", endX, startY);
  await page.waitForTimeout(250);
  await expect(page.locator('[data-video-player="true"]')).toHaveCount(1);
  await expect(page.getByText("Vote Video UX Test")).toBeVisible();
  await expect(page.locator('[data-testid="album-gallery"]')).toHaveCount(0);
  expect(voteRequests).toHaveLength(0);

  const card = page.locator('[data-video-player="true"]').locator("..", { has: video }).first();
  await expect(card).toBeVisible();

  const dislikeButton = page.getByRole("button", { name: "Dislike", exact: true });
  const likeButton = page.getByRole("button", { name: "Like", exact: true });
  const dislikeIcon = dislikeButton.locator("svg").first();
  const likeIcon = likeButton.locator("svg").first();
  await expect(dislikeIcon).toHaveAttribute("width", "28");
  await expect(likeIcon).toHaveAttribute("width", "28");
});

test("vertical video swipe closes through the gallery callback", async ({ page }) => {
  await setup(page);
  const player = page.locator('[data-testid="gallery-shared-video"] [data-video-player="true"]').first();
  const box = await player.boundingBox();
  expect(box).not.toBeNull();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await touch(player, "touchstart", x, y);
  await page.waitForTimeout(30);
  await touch(player, "touchmove", x, y + 140);
  await touch(player, "touchend", x, y + 140);
  await page.waitForTimeout(500);
  await expect(page.locator('[data-testid="album-gallery"]')).toHaveCount(0);
});
