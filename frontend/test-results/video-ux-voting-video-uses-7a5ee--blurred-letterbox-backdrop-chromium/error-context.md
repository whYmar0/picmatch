# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: video-ux.spec.js >> voting video uses the bottom 20% for scrub and blurred letterbox backdrop
- Location: e2e\video-ux.spec.js:176:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByText('НЕ НРАВИТСЯ')
Expected: 1
Received: 2
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByText('НЕ НРАВИТСЯ')
    14 × locator resolved to 2 elements
       - unexpected value "2"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - link "Pickmatch Logo Pickmatch" [ref=e6] [cursor=pointer]:
        - /url: /
        - img "Pickmatch Logo" [ref=e8]
        - generic [ref=e9]: Pickmatch
      - generic [ref=e10]:
        - button [ref=e12] [cursor=pointer]:
          - img [ref=e13]
        - generic [ref=e16] [cursor=pointer]:
          - generic "Video UX Tester" [ref=e17]: V
          - img [ref=e19]
  - main [ref=e21]:
    - generic [ref=e22]:
      - generic [ref=e23]:
        - generic [ref=e24]:
          - generic [ref=e25]: V
          - generic [ref=e26]: Video UX Tester
        - heading "Vote Video UX Test" [level=2] [ref=e28]
      - button [ref=e32] [cursor=pointer]:
        - generic [ref=e33]:
          - generic:
            - generic:
              - img
      - generic [ref=e36]:
        - generic:
          - generic: 1/1
        - generic [ref=e37]:
          - generic [ref=e39]:
            - group "Playing video" [ref=e41]:
              - generic:
                - generic:
                  - generic:
                    - button:
                      - img
                    - button:
                      - img
            - generic [ref=e42]: НРАВИТСЯ
            - generic [ref=e43]: НЕ НРАВИТСЯ
          - button "Комментарии" [ref=e44] [cursor=pointer]:
            - img [ref=e45]
      - paragraph [ref=e47]: Вправо — нравится · влево — не нравится
      - generic [ref=e49]:
        - button "Dislike" [ref=e50] [cursor=pointer]:
          - img [ref=e51]
        - button "Like" [ref=e57] [cursor=pointer]:
          - img [ref=e58]
```

# Test source

```ts
  116 | });
  117 | 
  118 | test("mute control changes audio state without pausing video", async ({ page }) => {
  119 |   await setup(page);
  120 |   const player = page.locator('[data-testid="gallery-shared-video"] [data-video-player="true"]').first();
  121 |   const video = player.locator("video");
  122 |   await player.click({ position: { x: 20, y: 20 } });
  123 |   const muteButton = player.getByRole("button", { name: "Unmute video" });
  124 |   await expect(muteButton).toBeVisible();
  125 |   await muteButton.click();
  126 |   await expect(video).toHaveJSProperty("muted", false);
  127 |   await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
  128 |   await player.getByRole("button", { name: "Mute video" }).click();
  129 |   await expect(video).toHaveJSProperty("muted", true);
  130 | 
  131 |   await player.getByRole("button", { name: "Pause video" }).click();
  132 |   await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  133 |   await player.getByRole("button", { name: "Unmute video" }).click();
  134 |   await expect(video).toHaveJSProperty("muted", false);
  135 |   await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  136 | });
  137 | 
  138 | test("hold pauses the video and release resumes playback", async ({ page }) => {
  139 |   await setup(page);
  140 |   const player = page.locator('[data-testid="gallery-shared-video"] [data-video-player="true"]').first();
  141 |   const video = player.locator("video");
  142 |   const box = await player.boundingBox();
  143 |   expect(box).not.toBeNull();
  144 |   const x = box.x + box.width / 2;
  145 |   const y = box.y + box.height / 2;
  146 |   await touch(player, "touchstart", x, y);
  147 |   await page.waitForTimeout(220);
  148 |   await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  149 |   const playButton = player.getByRole("button", { name: "Play video" });
  150 |   await expect(playButton).toBeVisible();
  151 |   await expect(playButton).toHaveClass(/border-0/);
  152 |   await expect(playButton).toHaveClass(/ring-0/);
  153 |   await touch(player, "touchend", x, y);
  154 |   await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
  155 | });
  156 | 
  157 | test("bottom horizontal swipe reveals the timeline and seeks", async ({ page }) => {
  158 |   await setup(page);
  159 |   const player = page.locator('[data-testid="gallery-shared-video"] [data-video-player="true"]').first();
  160 |   const video = player.locator("video");
  161 |   const box = await player.boundingBox();
  162 |   expect(box).not.toBeNull();
  163 |   await expect.poll(() => video.evaluate((node) => Number.isFinite(node.duration) && node.duration > 0)).toBe(true);
  164 |   const y = box.y + box.height * 0.9;
  165 |   await touch(player, "touchstart", box.x + 10, y);
  166 |   await touch(player, "touchmove", box.x + box.width * 0.75, y);
  167 |   await page.waitForTimeout(100);
  168 |   await expect(player.locator('[data-video-controls="true"]')).toBeVisible();
  169 |   const timeline = player.getByRole("slider", { name: "Video progress" });
  170 |   await expect(timeline).toHaveCount(1);
  171 |   await expect(timeline).toBeVisible();
  172 |   await expect.poll(() => video.evaluate((node) => node.currentTime > 0)).toBe(true);
  173 |   await touch(player, "touchend", box.x + box.width * 0.75, y);
  174 | });
  175 | 
  176 | test("voting video uses the bottom 20% for scrub and blurred letterbox backdrop", async ({ page }) => {
  177 |   await page.setViewportSize({ width: 375, height: 812 });
  178 |   await page.route(`${API}/api/albums/invite/video-ux-test`, async (route) => route.fulfill({ json: {
  179 |     id: "vote-video-album",
  180 |     title: "Vote Video UX Test",
  181 |     description: null,
  182 |     invite_code: "video-ux-test",
  183 |     invite_url: `${FRONTEND}/vote/video-ux-test`,
  184 |     is_active: true,
  185 |     is_public: true,
  186 |     photo_count: 1,
  187 |     total_votes: 0,
  188 |     created_at: "2026-01-01T00:00:00Z",
  189 |     creator: USER,
  190 |     photos: [{ ...firstVideo, id: "vote-video-1" }],
  191 |   }}));
  192 |   await page.route(`${API}/api/votes/session/video-ux-test`, async (route) => route.fulfill({ json: { voted_photo_ids: [] } }));
  193 |   const voteRequests = [];
  194 |   await page.route(`${API}/api/votes/`, async (route) => {
  195 |     voteRequests.push(route.request().postDataJSON());
  196 |     return route.fulfill({ json: { id: "vote-result" } });
  197 |   });
  198 |   await page.route(`${API}/api/auth/me`, async (route) => route.fulfill({ json: USER }));
  199 |   await page.route(`${API}/api/notifications/`, async (route) => route.fulfill({ json: [] }));
  200 |   await page.route(`${API}/api/comments/photo/**`, async (route) => route.fulfill({ json: [] }));
  201 |   await page.route("**/video-ux-test.mp4", async (route) => route.fulfill({
  202 |     status: 200,
  203 |     contentType: "video/mp4",
  204 |     body: fs.readFileSync(VIDEO_FIXTURE),
  205 |   }));
  206 |   await page.addInitScript(({ token, user }) => {
  207 |     const raw = JSON.stringify(user);
  208 |     localStorage.setItem("pickmatch_token", token);
  209 |     localStorage.setItem("pickmatch_user", raw);
  210 |     sessionStorage.setItem("pickmatch_token", token);
  211 |     sessionStorage.setItem("pickmatch_user", raw);
  212 |   }, { token: TOKEN, user: USER });
  213 |   await page.goto(`${FRONTEND}/vote/video-ux-test`, { waitUntil: "domcontentloaded" });
  214 |   await expect(page.getByText("Vote Video UX Test")).toBeVisible();
  215 |   await expect(page.getByText("Вправо — нравится · влево — не нравится")).toBeVisible();
> 216 |   await expect(page.getByText("НЕ НРАВИТСЯ")).toHaveCount(1);
      |                                               ^ Error: expect(locator).toHaveCount(expected) failed
  217 |   const viewportWidth = await page.evaluate(() => window.innerWidth);
  218 |   const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  219 |   expect(documentWidth).toBeLessThanOrEqual(viewportWidth);
  220 |   await expect(page.locator('[data-testid="thumbnail-edge-fade"]')).toHaveCount(2);
  221 |   const edgeFades = page.locator('[data-testid="thumbnail-edge-fade"]');
  222 |   await expect(edgeFades.nth(0)).not.toHaveClass(/backdrop-blur/);
  223 |   await expect(edgeFades.nth(1)).not.toHaveClass(/backdrop-blur/);
  224 | 
  225 |   const player = page.locator('[data-video-player="true"]').first();
  226 |   const video = player.locator('[data-video-main="true"]');
  227 |   const background = player.locator('[data-video-backdrop="true"]');
  228 |   await expect(player).toHaveAttribute("data-video-player", "true");
  229 |   await expect(background).toHaveCount(1);
  230 |   await expect(background).toHaveJSProperty("muted", true);
  231 |   await expect(background).toHaveClass(/object-cover/);
  232 |   await expect(background).toHaveClass(/blur-2xl/);
  233 |   await expect.poll(() => video.evaluate((node) => Number.isFinite(node.duration) && node.duration > 0)).toBe(true);
  234 | 
  235 |   const box = await player.boundingBox();
  236 |   expect(box).not.toBeNull();
  237 |   const startY = box.y + box.height * 0.9;
  238 |   const startX = box.x + 10;
  239 |   const endX = box.x + box.width * 0.75;
  240 |   await touch(player, "touchstart", startX, startY);
  241 |   await touch(player, "touchmove", endX, startY);
  242 |   await page.waitForTimeout(100);
  243 |   await expect(player.getByRole("slider", { name: "Video progress" })).toBeVisible();
  244 |   await expect.poll(() => video.evaluate((node) => node.currentTime > 0)).toBe(true);
  245 |   await touch(player, "touchend", endX, startY);
  246 |   await page.waitForTimeout(250);
  247 |   await expect(page.locator('[data-video-player="true"]')).toHaveCount(1);
  248 |   await expect(page.getByText("Vote Video UX Test")).toBeVisible();
  249 |   await expect(page.locator('[data-testid="album-gallery"]')).toHaveCount(0);
  250 |   expect(voteRequests).toHaveLength(0);
  251 | 
  252 |   const card = page.locator('[data-video-player="true"]').locator("..", { has: video }).first();
  253 |   await expect(card).toBeVisible();
  254 | 
  255 |   const dislikeButton = page.getByRole("button", { name: "Dislike", exact: true });
  256 |   const likeButton = page.getByRole("button", { name: "Like", exact: true });
  257 |   const dislikeIcon = dislikeButton.locator("svg").first();
  258 |   const likeIcon = likeButton.locator("svg").first();
  259 |   await expect(dislikeIcon).toHaveAttribute("width", "28");
  260 |   await expect(likeIcon).toHaveAttribute("width", "28");
  261 | });
  262 | 
  263 | test("vertical video swipe closes through the gallery callback", async ({ page }) => {
  264 |   await setup(page);
  265 |   const player = page.locator('[data-testid="gallery-shared-video"] [data-video-player="true"]').first();
  266 |   const box = await player.boundingBox();
  267 |   expect(box).not.toBeNull();
  268 |   const x = box.x + box.width / 2;
  269 |   const y = box.y + box.height / 2;
  270 |   await touch(player, "touchstart", x, y);
  271 |   await page.waitForTimeout(30);
  272 |   await touch(player, "touchmove", x, y + 140);
  273 |   await touch(player, "touchend", x, y + 140);
  274 |   await page.waitForTimeout(500);
  275 |   await expect(page.locator('[data-testid="album-gallery"]')).toHaveCount(0);
  276 | });
  277 | 
```