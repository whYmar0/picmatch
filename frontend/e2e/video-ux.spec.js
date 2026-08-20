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

async function pointer(locator, type, x, y) {
  await locator.evaluate((el, { type: eventType, x: clientX, y: clientY }) => {
    el.dispatchEvent(new PointerEvent(eventType, {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    }));
  }, { type, x, y });
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
  const progress = player.locator('[data-video-timeline-progress="true"]');
  const progressBeforePlayback = await progress.evaluate((node) => node.getBoundingClientRect().width);
  await page.waitForTimeout(300);
  const progressDuringPlayback = await progress.evaluate((node) => node.getBoundingClientRect().width);
  expect(progressDuringPlayback).toBeGreaterThan(progressBeforePlayback);
  const playbackSamples = [];
  for (let sample = 0; sample < 4; sample += 1) {
    await page.waitForTimeout(200);
    playbackSamples.push(await player.evaluate((root) => ({
      currentTime: root.querySelector('[data-video-main="true"]')?.currentTime,
      renderedRectWidth: root.querySelector('[data-video-timeline-progress="true"]')?.getBoundingClientRect().width,
      isPlaying: !root.querySelector('[data-video-main="true"]')?.paused,
    })));
  }
  expect(playbackSamples.every((sample) => sample.isPlaying)).toBe(true);
  expect(playbackSamples.at(-1).currentTime).toBeGreaterThan(playbackSamples[0].currentTime);
  expect(playbackSamples.at(-1).renderedRectWidth).toBeGreaterThan(playbackSamples[0].renderedRectWidth);
  expect(playbackSamples.at(-1).renderedRectWidth).toBeGreaterThan(0);

  const playerBox = await player.boundingBox();
  expect(playerBox).not.toBeNull();
  const centerX = playerBox.x + playerBox.width / 2;
  const centerY = playerBox.y + playerBox.height / 2;
  await touch(player, "touchstart", centerX, centerY);
  await touch(player, "touchend", centerX, centerY);
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  const playButton = player.getByRole("button", { name: "Play video" });
  await expect(playButton).toBeVisible();
  await expect(player.getByRole("button", { name: "Unmute video" })).toBeVisible();
  const layerStyles = await player.evaluate((root) => {
    const controls = root.querySelector('[data-video-controls="true"]');
    const button = [...root.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === "Play video");
    const fill = button?.querySelector('[aria-hidden="true"]');
    const controlsStyle = getComputedStyle(controls);
    const fillStyle = getComputedStyle(fill);
    return {
      controlsOpacity: controlsStyle.opacity,
      controlsBackground: controlsStyle.backgroundColor,
      fillBackground: fillStyle.backgroundColor,
      fillBackdrop: fillStyle.backdropFilter,
    };
  });
  expect(layerStyles).toEqual({
    controlsOpacity: "1",
    controlsBackground: "rgba(0, 0, 0, 0)",
    fillBackground: "rgba(0, 0, 0, 0.5)",
    fillBackdrop: "blur(4px)",
  });

  // Compare rendered pixels outside the two control circles with the layer
  // visible and hidden. The paused frame is identical, so any difference here
  // would prove that the controls layer is dimming the video globally.
  await page.waitForTimeout(200);
  const withControls = await player.screenshot();
  await player.locator('[data-video-controls="true"]').evaluate((element) => {
    element.style.visibility = "hidden";
  });
  const withoutControls = await player.screenshot();
  await player.locator('[data-video-controls="true"]').evaluate((element) => {
    element.style.visibility = "";
  });
  const renderedSamples = await page.evaluate(async ({ withControlsBase64, withoutControlsBase64 }) => {
    const decode = async (base64) => {
      const response = await fetch(`data:image/png;base64,${base64}`);
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
    };
    const first = await decode(withControlsBase64);
    const second = await decode(withoutControlsBase64);
    const points = [
      [5, 5], [Math.floor(first.width * 0.08), Math.floor(first.height * 0.2)],
      [Math.floor(first.width * 0.92), Math.floor(first.height * 0.2)],
      [Math.floor(first.width * 0.08), Math.floor(first.height * 0.8)],
      [Math.floor(first.width * 0.92), Math.floor(first.height * 0.8)],
    ];
    return points.map(([x, y]) => {
      const offset = (y * first.width + x) * 4;
      return {
        point: [x, y],
        withControls: [...first.data.slice(offset, offset + 4)],
        withoutControls: [...second.data.slice(offset, offset + 4)],
      };
    });
  }, {
    withControlsBase64: withControls.toString("base64"),
    withoutControlsBase64: withoutControls.toString("base64"),
  });
  console.log("RENDERED_VIDEO_SAMPLES", JSON.stringify(renderedSamples));
  expect(renderedSamples.every(({ withControls: first, withoutControls: second }) =>
    first.every((channel, index) => channel === second[index])
  )).toBe(true);
  await playButton.click();
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
});

test("mute control changes audio state without pausing video", async ({ page }) => {
  await setup(page);
  const player = page.locator('[data-testid="gallery-shared-video"] [data-video-player="true"]').first();
  const video = player.locator("video");
  // Pause to reveal the controls, then resume through the playback button.
  await player.click({ position: { x: 20, y: 20 } });
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  await player.getByRole("button", { name: "Play video" }).click();
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);

  // The mute button must not affect playback while the video is playing.
  const muteButton = player.locator('button[aria-label="Unmute video"]');
  await expect(muteButton).toHaveCount(1);
  await muteButton.dispatchEvent("click");
  await expect(video).toHaveJSProperty("muted", false);
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
  await player.locator('button[aria-label="Mute video"]').dispatchEvent("click");
  await expect(video).toHaveJSProperty("muted", true);

  await player.locator('button[aria-label="Pause video"]').dispatchEvent("click");
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
  // Long-press pauses silently; controls must stay hidden until release.
  await expect(playButton).toBeHidden();
  await expect(player.getByRole("button", { name: "Unmute video" })).toBeHidden();
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
  await page.waitForTimeout(400);
  const frameBox = await player.locator('[data-video-frame="true"]').boundingBox();
  expect(frameBox).not.toBeNull();
  const y = frameBox.y + frameBox.height * 0.9;
  const timeline = player.locator('[data-video-timeline="true"]');
  await pointer(timeline, "pointerdown", frameBox.x + 10, y);
  await touch(timeline, "touchstart", frameBox.x + 10, y);
  await touch(timeline, "touchmove", frameBox.x + frameBox.width, y);
  await page.waitForTimeout(100);
  await expect(timeline).toBeVisible();
  // Scrubbing freezes playback, including at the right edge. The video must
  // not loop back to the beginning while the finger is still down.
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  await expect(player.getByRole("button", { name: "Play video" })).toBeHidden();
  await expect(player.getByRole("button", { name: "Unmute video" })).toBeHidden();
  await page.waitForTimeout(300);
  await expect(video).toHaveJSProperty("paused", true);
  const timelineSlider = player.getByRole("slider", { name: "Video progress" });
  await expect(timelineSlider).toHaveCount(1);
  await expect(timelineSlider).toBeVisible();
  const timelineBox = await timeline.boundingBox();
  const trackBox = await player.locator('[data-video-timeline-track="true"]').boundingBox();
  const measuredFrameBox = await player.locator('[data-video-frame="true"]').boundingBox();
  expect(measuredFrameBox).not.toBeNull();
  expect(timelineBox).not.toBeNull();
  expect(trackBox).not.toBeNull();
  expect(Math.abs((measuredFrameBox.y + measuredFrameBox.height) - (timelineBox.y + timelineBox.height))).toBeLessThanOrEqual(1);
  expect(Math.abs(measuredFrameBox.x - trackBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((measuredFrameBox.x + measuredFrameBox.width) - (trackBox.x + trackBox.width))).toBeLessThanOrEqual(1);
  expect(Math.abs((measuredFrameBox.y + measuredFrameBox.height) - (trackBox.y + trackBox.height))).toBeLessThanOrEqual(1);
  await expect(player.locator('[data-video-scrub-time="true"]')).toBeVisible();
  const timelineStyles = await player.locator('[data-video-timeline-track="true"]').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      height: style.height,
      borderWidth: style.borderWidth,
      borderRadius: style.borderRadius,
      backgroundColor: style.backgroundColor,
    };
  });
  expect(timelineStyles).toEqual({
    height: "4px",
    borderWidth: "0px",
    borderRadius: "9999px",
    backgroundColor: "rgba(55, 65, 81, 0.9)",
  });
  const progress = player.locator('[data-video-timeline-progress="true"]');
  await expect.poll(() => progress.evaluate((node) => node.style.transform)).toBe("scaleX(1)");
  await touch(timeline, "touchend", frameBox.x + frameBox.width, y);
  await pointer(timeline, "pointerup", frameBox.x + frameBox.width, y);
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
  await expect.poll(() => progress.evaluate((node) => node.style.transform)).toBe("scaleX(1)");
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
  await expect(page.getByText("НЕ НРАВИТСЯ", { exact: true }).first()).toBeVisible();
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
  const timeline = player.locator('[data-video-timeline="true"]');
  await pointer(timeline, "pointerdown", startX, startY);
  await touch(timeline, "touchstart", startX, startY);
  await touch(timeline, "touchmove", endX, startY);
  await page.waitForTimeout(100);
  await expect(player.getByRole("slider", { name: "Video progress" })).toBeVisible();
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  await expect(player.getByRole("button", { name: "Play video" })).toBeHidden();
  await expect(player.getByRole("button", { name: "Unmute video" })).toBeHidden();
  await page.waitForTimeout(300);
  await expect(video).toHaveJSProperty("paused", true);
  await touch(timeline, "touchend", endX, startY);
  await pointer(timeline, "pointerup", endX, startY);
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
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

test("voting photo pinch zoom follows two fingers and returns to the card", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route(`${API}/api/albums/invite/photo-pinch-test`, async (route) => route.fulfill({ json: {
    id: "photo-pinch-album",
    title: "Photo Pinch Test",
    description: null,
    invite_code: "photo-pinch-test",
    invite_url: `${FRONTEND}/vote/photo-pinch-test`,
    is_active: true,
    is_public: true,
    photo_count: 1,
    total_votes: 0,
    created_at: "2026-01-01T00:00:00Z",
    creator: USER,
    photos: [{ id: "photo-pinch-1", filename: "pinch.jpg", url: `${FRONTEND}/photo-pinch.jpg`, media_type: "image", order: 0 }],
  }}));
  await page.route(`${API}/api/votes/session/photo-pinch-test`, async (route) => route.fulfill({ json: { voted_photo_ids: [] } }));
  await page.route(`${API}/api/auth/me`, async (route) => route.fulfill({ json: USER }));
  await page.route(`${API}/api/notifications/`, async (route) => route.fulfill({ json: [] }));
  await page.route(`${API}/api/comments/photo/**`, async (route) => route.fulfill({ json: [] }));
  await page.route("**/photo-pinch.jpg", async (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#9966cc"/><circle cx="200" cy="150" r="90" fill="#fff"/></svg>` }));
  await page.addInitScript(({ token, user }) => {
    const raw = JSON.stringify(user);
    localStorage.setItem("pickmatch_token", token);
    localStorage.setItem("pickmatch_user", raw);
    sessionStorage.setItem("pickmatch_token", token);
    sessionStorage.setItem("pickmatch_user", raw);
  }, { token: TOKEN, user: USER });
  await page.goto(`${FRONTEND}/vote/photo-pinch-test`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Photo Pinch Test")).toBeVisible();

  const pinchImage = page.locator('[data-testid="vote-pinch-image"]');
  await expect(pinchImage).toBeVisible();
  await expect(page.locator('[data-testid="album-gallery"]')).toHaveCount(0);
  const box = await pinchImage.boundingBox();
  expect(box).not.toBeNull();
  const makeTouch = (identifier, x, y) => ({ identifier, target: null, clientX: x, clientY: y, pageX: x, pageY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
  await pinchImage.evaluate((el, { box }) => {
    const makeTouch = (identifier, x, y) => new Touch({ identifier, target: el, clientX: x, clientY: y, pageX: x, pageY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
    const first = makeTouch(1, box.x + 145, box.y + box.height / 2);
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [first], targetTouches: [first], changedTouches: [first], bubbles: true, cancelable: true }));
    const t1 = makeTouch(1, box.x + 110, box.y + box.height / 2);
    const t2 = makeTouch(2, box.x + 190, box.y + box.height / 2);
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [t1, t2], targetTouches: [t1, t2], changedTouches: [t2], bubbles: true, cancelable: true }));
    const t1Move = makeTouch(1, box.x + 70, box.y + box.height / 2);
    const t2Move = makeTouch(2, box.x + 230, box.y + box.height / 2);
    el.dispatchEvent(new TouchEvent("touchmove", { touches: [t1Move, t2Move], targetTouches: [t1Move, t2Move], changedTouches: [t2Move], bubbles: true, cancelable: true }));
  }, { box });
  await expect.poll(() => pinchImage.locator("img").evaluate((node) => getComputedStyle(node).transform)).not.toBe("none");
  await pinchImage.evaluate((el, { box }) => {
    const t = new Touch({ identifier: 1, target: el, clientX: box.x + 70, clientY: box.y + box.height / 2, pageX: box.x + 70, pageY: box.y + box.height / 2, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
    el.dispatchEvent(new TouchEvent("touchend", { touches: [], targetTouches: [], changedTouches: [t], bubbles: true, cancelable: true }));
  }, { box });
  await expect.poll(() => pinchImage.locator("img").evaluate((node) => {
    const transform = getComputedStyle(node).transform;
    return transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";
  })).toBe(true);
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
