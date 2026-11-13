import { test, expect } from "@playwright/test";

const user = id => ({ id, username: id, email: `${id}@example.com`, role: "creator", is_verified: true });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=", "base64");

async function movie(page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext("2d"), stream = canvas.captureStream(10), parts = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    recorder.ondataavailable = event => parts.push(event.data);
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    const draw = setInterval(() => { context.fillStyle = "blue"; context.fillRect(0, 0, 32, 32); }, 40);
    await new Promise(resolve => setTimeout(resolve, 2000));
    recorder.stop(); await stopped; clearInterval(draw); stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(parts, { type: "video/webm" }).arrayBuffer()));
  });
  return Buffer.from(bytes);
}

async function setup(page, { failFirstImage = false, holdB = false } = {}) {
  const media = await movie(page), pending = [], counts = new Map();
  let firstImage = true;
  await page.addInitScript(initial => {
    localStorage.setItem("pickmatch_token", "token-a");
    localStorage.setItem("pickmatch_user", JSON.stringify(initial));
  }, user("a"));
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,HEAD,OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: user("a"), headers: cors });
    if (url.pathname.endsWith("/auth/login")) return route.fulfill({ json: { access_token: "token-b", token_type: "bearer", user: user("b") }, headers: cors });
    if (url.pathname.endsWith("/access")) {
      const who = request.headers().authorization === "Bearer token-b" ? "b" : "a";
      const id = url.pathname.split("/").at(-2), key = who + id;
      counts.set(key, (counts.get(key) || 0) + 1);
      url.pathname = url.pathname.replace(/\/access$/, "");
      url.searchParams.set("ticket", `${who}-${counts.get(key)}`);
      const fulfill = () => route.fulfill({ json: { url: url.href, expires_at: Math.floor(Date.now() / 1000) + 300 }, headers: cors });
      if (holdB && who === "b") return new Promise(resolve => pending.push(() => fulfill().then(resolve)));
      return fulfill();
    }
    if (url.pathname.includes("/media/")) {
      if (!url.searchParams.has("ticket")) return route.fulfill({ status: 404, headers: cors });
      const isVideo = url.pathname.includes("22222222");
      if (!isVideo && failFirstImage && firstImage) { firstImage = false; return route.fulfill({ status: 403, headers: cors }); }
      return route.fulfill({ body: isVideo ? media : png, contentType: isVideo ? "video/webm" : "image/png", headers: cors });
    }
    return route.fulfill({ json: [], headers: cors });
  });
  await page.goto("/e2e/fixtures/media-access.html");
  return { pending, counts };
}

test("private image retries a failed ticket and forwards motion/native refs", async ({ page }) => {
  const state = await setup(page, { failFirstImage: true });
  await expect(page.getByTestId("image-ref")).toHaveText("IMG");
  await expect(page.getByTestId("video-ref")).toHaveText("VIDEO");
  await expect(page.getByTestId("failures")).toHaveText("0");
  expect(state.counts.get("a11111111-1111-4111-8111-111111111111")).toBe(2);
  expect(await page.getByTestId("image").evaluate(image => image.naturalWidth)).toBe(1);
});

test("mounted elements clear former-account sources while the new ticket is pending", async ({ page }) => {
  const state = await setup(page, { holdB: true });
  await expect(page.getByTestId("image-ref")).toHaveText("IMG");
  await expect(page.getByTestId("video-ref")).toHaveText("VIDEO");
  await expect.poll(() => page.getByTestId("player").locator("video").evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.getByTestId("player").locator("canvas").evaluate(canvas => canvas.width)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Switch account" }).click();
  await expect.poll(() => state.pending.length).toBe(2);
  await expect(page.getByTestId("image")).not.toHaveAttribute("src");
  await expect(page.getByTestId("video")).not.toHaveAttribute("src");
  await expect.poll(() => page.getByTestId("image").evaluate(image => image.currentSrc)).toBe("");
  await expect.poll(() => page.getByTestId("video").evaluate(video => video.currentSrc)).toBe("");
  expect(await page.getByTestId("video").evaluate(video => ({ ready: video.readyState, buffered: video.buffered.length }))).toEqual({ ready: 0, buffered: 0 });
  expect(await page.getByTestId("player").locator("canvas").evaluate(canvas => canvas.width)).toBe(0);
  await Promise.all(state.pending.map(finish => finish()));
  await expect(page.getByTestId("image")).toHaveAttribute("src", /ticket=b-/);
  await expect(page.getByTestId("video")).toHaveAttribute("src", /ticket=b-/);
});

test("video preserves playback position and permits later ticket renewals", async ({ page }) => {
  const state = await setup(page);
  const video = page.getByTestId("video");
  await expect(page.getByTestId("video-ref")).toHaveText("VIDEO");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await video.evaluate(async element => { element.currentTime = 0.6; element.dispatchEvent(new Event("timeupdate")); await element.play(); });
    const before = await video.evaluate(element => element.currentTime);
    await video.evaluate(element => element.dispatchEvent(new Event("error")));
    await expect.poll(() => state.counts.get("a22222222-2222-4222-8222-222222222222")).toBe(attempt + 2);
    await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThanOrEqual(before - 0.1);
    await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
    await expect.poll(() => page.getByTestId("metadata").textContent().then(Number)).toBeGreaterThanOrEqual(attempt + 2);
  }
});
