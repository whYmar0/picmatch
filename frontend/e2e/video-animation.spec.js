import { test, expect } from "@playwright/test";
import fs from "node:fs";

const FRONTEND = process.env.E2E_BASE_URL || "http://localhost:5173";
const API = process.env.E2E_API_URL || "http://localhost:8000";
const VIDEO_FIXTURE = new URL("../document_5415749994122616064.mp4", import.meta.url);
const TOKEN = "video-animation-test-token";
const USER = {
  id: "video-test-user",
  email: "video-test@example.com",
  username: "Video Tester",
  role: "creator",
  avatar_url: null,
  avatar_color: "#9966CC",
  is_verified: true,
  created_at: "2026-01-01T00:00:00Z",
};

const videoPhoto = {
  id: "video-photo-1",
  filename: "animation-test.mp4",
  url: `${FRONTEND}/video-animation-test.mp4`,
  media_type: "video",
  order: 0,
  created_at: "2026-01-01T00:00:00Z",
};
const secondVideoPhoto = {
  ...videoPhoto,
  id: "video-photo-2",
  filename: "animation-test-2.mp4",
  order: 1,
};

const album = {
  id: "video-animation-album",
  title: "Video Animation Test",
  description: null,
  invite_code: "video-animation-test",
  invite_url: "http://localhost:5173/vote/video-animation-test",
  is_active: true,
  is_public: true,
  photo_count: 2,
  total_votes: 0,
  created_at: "2026-01-01T00:00:00Z",
  creator: USER,
  photos: [videoPhoto, secondVideoPhoto],
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
  photos: [videoPhoto, secondVideoPhoto].map((photo) => ({
    ...photo,
    like_count: 0,
    dislike_count: 0,
    total_votes: 0,
    like_percentage: 0,
    is_winner: false,
    reactions: [],
  })),
  winner: null,
  created_at: album.created_at,
  is_shared: false,
  can_view_stats: true,
};

async function mockVideoGalleryApi(page) {
  await page.route(`${API}/api/**`, async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname === "/api/auth/me") {
      await route.fulfill({ json: USER });
      return;
    }
    if (pathname === "/api/albums/my") {
      await route.fulfill({ json: [album] });
      return;
    }
    if (pathname === `/api/albums/${album.id}/analytics`) {
      await route.fulfill({ json: analytics });
      return;
    }
    if (pathname.startsWith("/api/comments/photo/")) {
      await route.fulfill({ json: [] });
      return;
    }
    if (pathname === "/api/notifications/") {
      await route.fulfill({ json: [] });
      return;
    }

    await route.continue();
  });
  await page.route("**/video-animation-test.mp4", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "video/mp4",
      body: fs.readFileSync(VIDEO_FIXTURE),
    });
  });
}

async function dispatchSwipeDown(layer) {
  await layer.evaluate((el) => {
    const x = window.innerWidth / 2;
    const startY = window.innerHeight / 2;
    const endY = startY + 150;
    const makeTouch = (y) => new Touch({
      identifier: 0,
      target: el,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      force: 1,
    });

    const start = makeTouch(startY);
    const end = makeTouch(endY);
    el.dispatchEvent(new TouchEvent("touchstart", {
      touches: [start],
      targetTouches: [start],
      changedTouches: [start],
      bubbles: true,
    }));
    el.dispatchEvent(new TouchEvent("touchmove", {
      touches: [end],
      targetTouches: [end],
      changedTouches: [end],
      bubbles: true,
    }));
    el.dispatchEvent(new TouchEvent("touchend", {
      touches: [],
      targetTouches: [],
      changedTouches: [end],
      bubbles: true,
    }));
  });
}

test("video cover uses the shared-element swipe-down exit animation", async ({ page }) => {
  await mockVideoGalleryApi(page);
  await page.addInitScript(({ token, user }) => {
    const raw = JSON.stringify(user);
    localStorage.setItem("pickmatch_token", token);
    localStorage.setItem("pickmatch_user", raw);
    sessionStorage.setItem("pickmatch_token", token);
    sessionStorage.setItem("pickmatch_user", raw);
  }, { token: TOKEN, user: USER });

  await page.goto(`${FRONTEND}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Video Animation Test")).toBeVisible();

  const cardSharedMedia = page.locator('[data-shared-media="album-cover-video-animation-album"]');
  await expect(cardSharedMedia).toHaveCount(1);

  await page.locator('[data-testid="album-card-photo"]').click();
  await expect(page.locator('[data-testid="album-gallery"]')).toBeVisible();
  await expect(cardSharedMedia).toHaveCount(2);
  const gallerySharedVideo = page.locator('[data-testid="gallery-shared-video"]');
  await expect(gallerySharedVideo).toBeVisible();
  const before = await gallerySharedVideo.boundingBox();
  expect(before).not.toBeNull();

  const touchLayer = page.locator('[data-testid="gallery-touch-layer"]');
  await dispatchSwipeDown(touchLayer);

  // AnimatePresence keeps the gallery mounted during the FLIP exit. Both the
  // card target and the exiting gallery source must coexist for the handoff.
  await expect(cardSharedMedia).toHaveCount(2);
  await page.waitForTimeout(50);
  const during = await gallerySharedVideo.boundingBox();
  expect(during).not.toBeNull();
  expect(Math.abs(during.y - before.y) + Math.abs(during.x - before.x)).toBeGreaterThan(1);
  await page.waitForTimeout(500);
  await expect(cardSharedMedia).toHaveCount(1);
  await expect(page.locator('[data-testid="album-gallery"]')).toHaveCount(0);

  // The second video is not the album-cover shared element. Verify that
  // carousel navigation still renders it and that its swipe-down close path
  // completes without freezing or leaving the overlay mounted.
  await page.locator('[data-testid="album-card-photo"]').click();
  await expect(page.locator('[data-testid="album-gallery"]')).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  await expect(page.locator('[data-testid="carousel-track"] [data-media-id="video-photo-2"] video')).toHaveCount(1);
  await dispatchSwipeDown(page.locator('[data-testid="gallery-touch-layer"]'));
  await page.waitForTimeout(400);
  await expect(page.locator('[data-testid="album-gallery"]')).toHaveCount(0);
});
