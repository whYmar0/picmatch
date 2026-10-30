import { test, expect } from "@playwright/test";

const FRONTEND = process.env.E2E_BASE_URL || "http://localhost:5173";
const PHOTO_COUNT = 55;
const SWIPE_COUNT = 20;
// Photo dimensions are configurable so the same harness can isolate decoding
// cost (large photos) from layout/React cost (tiny photos).
const PHOTO_WIDTH = Number(process.env.VOTE_PERF_PHOTO_W || 1200);
const PHOTO_HEIGHT = Number(process.env.VOTE_PERF_PHOTO_H || 1600);
const USER = {
  id: "vote-performance-user",
  email: "vote-performance@example.com",
  username: "Performance Tester",
  role: "creator",
  avatar_url: null,
  is_verified: true,
};

async function makeJpeg(page, width, height, seed) {
  const dataUrl = await page.evaluate(({ width: imageWidth, height: imageHeight, seed: initialSeed }) => {
    const canvas = document.createElement("canvas");
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const image = context.createImageData(imageWidth, imageHeight);
    let seedValue = initialSeed;
    for (let index = 0; index < image.data.length; index += 4) {
      seedValue ^= seedValue << 13;
      seedValue ^= seedValue >>> 17;
      seedValue ^= seedValue << 5;
      image.data[index] = seedValue & 255;
      image.data[index + 1] = (seedValue >>> 8) & 255;
      image.data[index + 2] = (seedValue >>> 16) & 255;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.78);
  }, { width, height, seed });
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

async function runThrottledVoteSession(browser, rate) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });

  const photoBytes = await makeJpeg(page, PHOTO_WIDTH, PHOTO_HEIGHT, 0x1a2b3c4d);
  const thumbBytes = await makeJpeg(page, 160, 214, 0x5e6f7788);
  const voteRequests = [];
  const code = `vote-perf-${rate}x`;
  const photos = Array.from({ length: PHOTO_COUNT }, (_, index) => ({
    id: `perf-photo-${index}`,
    filename: `heavy-${index}.jpg`,
    url: `${FRONTEND}/stress-photo-${index}.jpg`,
    thumb_url: `${FRONTEND}/stress-thumb-${index}.jpg`,
    media_type: "image",
    order: index,
  }));
  const album = {
    id: `perf-album-${rate}`,
    title: `Vote FPS Stress ${rate}x`,
    description: null,
    invite_code: code,
    invite_url: `${FRONTEND}/vote/${code}`,
    is_active: true,
    is_public: true,
    photo_count: PHOTO_COUNT,
    total_votes: 0,
    creator: USER,
    photos,
  };

  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith("/api/auth/me")) return route.fulfill({ json: USER });
    if (pathname.endsWith(`/api/albums/invite/${code}`)) return route.fulfill({ json: album });
    if (pathname.endsWith(`/api/votes/session/${code}`)) return route.fulfill({ json: { voted_photo_ids: [] } });
    if (pathname.endsWith("/api/votes/")) {
      voteRequests.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: `perf-vote-${voteRequests.length}` } });
    }
    if (pathname.endsWith("/api/notifications/")) return route.fulfill({ json: [] });
    if (pathname.includes("/api/comments/photo/")) return route.fulfill({ json: [] });
    return route.continue();
  });
  await page.route("**/stress-photo-*.jpg", (route) => route.fulfill({
    status: 200,
    contentType: "image/jpeg",
    body: photoBytes,
  }));
  await page.route("**/stress-thumb-*.jpg", (route) => route.fulfill({
    status: 200,
    contentType: "image/jpeg",
    body: thumbBytes,
  }));
  await page.addInitScript(({ user }) => {
    const serialized = JSON.stringify(user);
    localStorage.setItem("pickmatch_token", "vote-performance-token");
    localStorage.setItem("pickmatch_user", serialized);
    sessionStorage.setItem("pickmatch_token", "vote-performance-token");
    sessionStorage.setItem("pickmatch_user", serialized);
  }, { user: USER });

  try {
    await page.goto(`${FRONTEND}/vote/${code}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(`Vote FPS Stress ${rate}x`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("vote-photo-counter")).toHaveText(`1/${PHOTO_COUNT}`);
    await page.locator('[data-testid="vote-pinch-image"] img').first().evaluate((image) => image.decode());
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const perf = { segments: [], longTasks: [], activeSegment: null };
      window.__votePerf = perf;
      if ("PerformanceObserver" in window && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
        perf.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            perf.longTasks.push({ start: entry.startTime, duration: entry.duration });
          }
        });
        perf.observer.observe({ type: "longtask", buffered: false });
      }
      window.__startVotePerfSegment = () => {
        const segment = { samples: [], running: true };
        perf.segments.push(segment);
        perf.activeSegment = segment;
        const sample = (now) => {
          if (!segment.running) return;
          segment.samples.push(now);
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      };
      window.__stopVotePerfSegment = () => {
        if (perf.activeSegment) perf.activeSegment.running = false;
        perf.activeSegment = null;
      };
    });

    if (process.env.VOTE_PROFILE === "1") {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
    }
    const box = await page.locator('[data-pinch-enabled="true"]').first().boundingBox();
    expect(box, "card must be visible before stress swipes").not.toBeNull();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: centerX, y: centerY });
    for (let swipe = 0; swipe < SWIPE_COUNT; swipe += 1) {
      const targetX = swipe % 2 === 0 ? box.x + box.width * 0.94 : box.x + box.width * 0.06;
      const deltaX = (targetX - centerX) / 6;
      await page.evaluate(() => window.__startVotePerfSegment());
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: centerX, y: centerY, button: "left", buttons: 1, clickCount: 1 });
      for (let step = 1; step <= 6; step += 1) {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: centerX + deltaX * step, y: centerY, button: "left", buttons: 1 });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: targetX, y: centerY, button: "left", buttons: 0, clickCount: 1 });
      await page.waitForFunction((expected) => document.querySelector('[data-testid="vote-photo-counter"]')?.textContent === expected, `${swipe + 2}/${PHOTO_COUNT}`, { timeout: 10_000 });
      await page.evaluate(() => window.__stopVotePerfSegment());
    }

    await page.evaluate(() => {
      window.__votePerf.observer?.disconnect();
    });
    let profileSummary = null;
    if (process.env.VOTE_PROFILE === "1") {
      const { profile } = await cdp.send("Profiler.stop");
      const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
      const selfTimeByFrame = new Map();
      profile.samples?.forEach((nodeId, index) => {
        const frame = nodes.get(nodeId);
        const key = frame ? `${frame.functionName || "(anonymous)"} ${frame.url}:${frame.lineNumber + 1}` : String(nodeId);
        selfTimeByFrame.set(key, (selfTimeByFrame.get(key) || 0) + (profile.timeDeltas?.[index] || 0));
      });
      profileSummary = [...selfTimeByFrame.entries()]
        .sort((first, second) => second[1] - first[1])
        .slice(0, 20)
        .map(([frame, microseconds]) => ({ frame, selfMs: Math.round(microseconds / 100) / 10 }));
    }
    const measurements = await page.evaluate(() => {
      const perf = window.__votePerf;
      perf.observer?.takeRecords().forEach((entry) => perf.longTasks.push({ start: entry.startTime, duration: entry.duration }));
      perf.observer?.disconnect();
      const segmentStats = perf.segments.map(({ samples }) => {
        const elapsed = samples.length > 1 ? samples.at(-1) - samples[0] : 0;
        const deltas = samples.slice(1).map((time, index) => time - samples[index]);
        return {
          frameCount: samples.length,
          elapsedMs: elapsed,
          fps: elapsed > 0 ? ((samples.length - 1) * 1000) / elapsed : 0,
          maxFrameDeltaMs: deltas.length ? Math.max(...deltas) : null,
          framesOver18ms: deltas.filter((delta) => delta > 1000 / 55).length,
          framesOver50ms: deltas.filter((delta) => delta > 50).length,
        };
      });
      const activeRanges = perf.segments
        .filter(({ samples }) => samples.length > 1)
        .map(({ samples }) => [samples[0], samples.at(-1)]);
      const swipeRanges = perf.segments.map(({ samples }) => [samples[0], samples.at(-1)]);
      const activeLongTasks = perf.longTasks.filter(({ start, duration }) =>
        activeRanges.some(([first, last]) => start < last && start + duration > first)
      );
      const swipeLongTaskCounts = swipeRanges.map(([first, last]) => perf.longTasks.filter(({ start, duration }) => start < last && start + duration > first).length);
      const totalElapsed = segmentStats.reduce((sum, segment) => sum + segment.elapsedMs, 0);
      const totalFrames = segmentStats.reduce((sum, segment) => sum + Math.max(0, segment.frameCount - 1), 0);
      return {
        swipeCount: segmentStats.length,
        sampleCount: segmentStats.reduce((sum, segment) => sum + segment.frameCount, 0),
        activeElapsedMs: Math.round(totalElapsed),
        averageFps: totalElapsed > 0 ? Math.round(totalFrames * 1000 / totalElapsed * 10) / 10 : 0,
        minSwipeFps: Math.round(Math.min(...segmentStats.map((segment) => segment.fps)) * 10) / 10,
        minSwipeFrameDeltaMs: Math.round(Math.max(...segmentStats.map((segment) => segment.maxFrameDeltaMs || 0)) * 10) / 10,
        framesOver18ms: segmentStats.reduce((sum, segment) => sum + segment.framesOver18ms, 0),
        framesOver50ms: segmentStats.reduce((sum, segment) => sum + segment.framesOver50ms, 0),
        activeLongTaskCount: activeLongTasks.length,
        swipesWithLongTasks: swipeLongTaskCounts.filter((count) => count > 0).length,
        activeLongTasks: activeLongTasks.map(({ start, duration }) => ({ start: Math.round(start), duration: Math.round(duration * 10) / 10 })),
      };
    });
    const result = { rate, photoCount: PHOTO_COUNT, photoSize: `${PHOTO_WIDTH}x${PHOTO_HEIGHT}`, swipes: SWIPE_COUNT, votesSent: voteRequests.length, ...measurements, ...(profileSummary ? { topJavaScriptSelfTime: profileSummary } : {}) };
    console.log(`VOTE_FPS_STRESS ${JSON.stringify(result)}`);
    return result;
  } finally {
    await cdp.detach();
    await context.close();
  }
}

// Opt-in harness for the acceptance target in swipecard_optimization.md
// (55 FPS minimum per swipe, no Long Tasks, 20 swipes over 55 large photos at
// 4x and 6x CPU throttling). It is skipped by default because it is a
// performance measurement, not a functional assertion; run it with VOTE_PERF=1.
test.skip(!process.env.VOTE_PERF, "Set VOTE_PERF=1 to run the FPS stress harness");

const RATES = (process.env.VOTE_PERF_RATES || "4,6").split(",").map(Number);

test("vote stack maintains 55 FPS across 20 swipes on 55 large photos under 4x and 6x CPU throttling", async ({ browser }) => {
  test.setTimeout(240_000);
  const results = [];
  for (const rate of RATES) {
    const result = await runThrottledVoteSession(browser, rate);
    results.push(result);
    expect(result.votesSent, `${rate}x run must submit one vote per swipe`).toBe(SWIPE_COUNT);
  }
  for (const result of results) {
    expect(result.minSwipeFps, `${result.rate}x minimum swipe FPS: ${JSON.stringify(result)}`).toBeGreaterThanOrEqual(55);
    expect(result.minSwipeFrameDeltaMs, `${result.rate}x maximum frame gap must be <= 18.18ms: ${JSON.stringify(result)}`).toBeLessThanOrEqual(1000 / 55);
    expect(result.activeLongTaskCount, `${result.rate}x active swipe intervals must have no Long Tasks: ${JSON.stringify(result)}`).toBe(0);
  }
});
