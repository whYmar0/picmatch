# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: video-animation.spec.js >> video cover uses the shared-element swipe-down exit animation
- Location: e2e\video-animation.spec.js:153:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 759.6
Received:   650.47998046875
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
        - button "Notifications" [ref=e12] [cursor=pointer]:
          - img "Notifications" [ref=e14]
        - generic [ref=e16] [cursor=pointer]:
          - generic "Video Tester" [ref=e17]: V
          - img [ref=e19]
  - main [ref=e21]:
    - generic [ref=e22]:
      - generic [ref=e25]:
        - generic [ref=e26]:
          - heading "Мои альбомы" [level=1] [ref=e27]
          - link "Новый альбом" [ref=e28] [cursor=pointer]:
            - /url: /create
            - img [ref=e29]
        - region "Мои альбомы" [ref=e31]:
          - generic [ref=e33]:
            - generic [ref=e34] [cursor=pointer]:
              - generic:
                - generic:
                  - generic:
                    - img
              - generic [ref=e35]: 2 фото
            - generic [ref=e36]:
              - generic [ref=e37]:
                - heading "Video Animation Test" [level=3] [ref=e38]
                - generic [ref=e39]: 237 дн. назад
              - generic [ref=e40]:
                - button "Public" [ref=e41] [cursor=pointer]:
                  - img [ref=e42]
                - button "Копировать" [ref=e45] [cursor=pointer]:
                  - img [ref=e46]
                - button "Удалить" [ref=e49] [cursor=pointer]:
                  - img [ref=e50]
      - generic [ref=e54]:
        - generic [ref=e57]:
          - group "Playing video" [ref=e60]:
            - slider "Video progress" [ref=e65] [cursor=pointer]: "0.92"
          - group "Paused video" [ref=e67]:
            - generic [ref=e68]:
              - generic [ref=e69]:
                - button "Unmute video" [ref=e70] [cursor=pointer]:
                  - img [ref=e72]
                - button "Play video" [ref=e76] [cursor=pointer]:
                  - img [ref=e78]
              - slider "Video progress" [ref=e82] [cursor=pointer]: "0"
        - generic [ref=e83]:
          - generic [ref=e85]:
            - button [ref=e86] [cursor=pointer]
            - button [ref=e87] [cursor=pointer]
          - button "Open statistics" [ref=e89] [cursor=pointer]:
            - generic [ref=e90]:
              - img [ref=e92]
              - text: "0"
            - generic [ref=e94]:
              - img [ref=e96]
              - text: "0"
            - generic [ref=e102]:
              - img [ref=e104]
              - text: "0"
```

# Test source

```ts
  92  |     if (pathname.startsWith("/api/comments/photo/")) {
  93  |       await route.fulfill({ json: [] });
  94  |       return;
  95  |     }
  96  |     if (pathname === "/api/notifications/") {
  97  |       await route.fulfill({ json: [] });
  98  |       return;
  99  |     }
  100 | 
  101 |     await route.continue();
  102 |   });
  103 |   await page.route("**/video-animation-test.mp4", async (route) => {
  104 |     await route.fulfill({
  105 |       status: 200,
  106 |       contentType: "video/mp4",
  107 |       body: fs.readFileSync(VIDEO_FIXTURE),
  108 |     });
  109 |   });
  110 | }
  111 | 
  112 | async function dispatchSwipeDown(layer) {
  113 |   await layer.evaluate((el) => {
  114 |     const x = window.innerWidth / 2;
  115 |     const startY = window.innerHeight / 2;
  116 |     const endY = startY + 150;
  117 |     const makeTouch = (y) => new Touch({
  118 |       identifier: 0,
  119 |       target: el,
  120 |       clientX: x,
  121 |       clientY: y,
  122 |       pageX: x,
  123 |       pageY: y,
  124 |       radiusX: 1,
  125 |       radiusY: 1,
  126 |       rotationAngle: 0,
  127 |       force: 1,
  128 |     });
  129 | 
  130 |     const start = makeTouch(startY);
  131 |     const end = makeTouch(endY);
  132 |     el.dispatchEvent(new TouchEvent("touchstart", {
  133 |       touches: [start],
  134 |       targetTouches: [start],
  135 |       changedTouches: [start],
  136 |       bubbles: true,
  137 |     }));
  138 |     el.dispatchEvent(new TouchEvent("touchmove", {
  139 |       touches: [end],
  140 |       targetTouches: [end],
  141 |       changedTouches: [end],
  142 |       bubbles: true,
  143 |     }));
  144 |     el.dispatchEvent(new TouchEvent("touchend", {
  145 |       touches: [],
  146 |       targetTouches: [],
  147 |       changedTouches: [end],
  148 |       bubbles: true,
  149 |     }));
  150 |   });
  151 | }
  152 | 
  153 | test("video cover uses the shared-element swipe-down exit animation", async ({ page }) => {
  154 |   await mockVideoGalleryApi(page);
  155 |   await page.addInitScript(({ token, user }) => {
  156 |     const raw = JSON.stringify(user);
  157 |     localStorage.setItem("pickmatch_token", token);
  158 |     localStorage.setItem("pickmatch_user", raw);
  159 |     sessionStorage.setItem("pickmatch_token", token);
  160 |     sessionStorage.setItem("pickmatch_user", raw);
  161 |   }, { token: TOKEN, user: USER });
  162 | 
  163 |   await page.goto(`${FRONTEND}/dashboard`, { waitUntil: "domcontentloaded" });
  164 |   await expect(page.getByText("Video Animation Test")).toBeVisible();
  165 | 
  166 |   const cardSharedMedia = page.locator('[data-shared-media="album-cover-video-animation-album"]');
  167 |   await expect(cardSharedMedia).toHaveCount(1);
  168 | 
  169 |   await page.locator('[data-testid="album-card-photo"]').click();
  170 |   await expect(page.locator('[data-testid="album-gallery"]')).toBeVisible();
  171 |   await expect(cardSharedMedia).toHaveCount(2);
  172 |   const gallerySharedVideo = page.locator('[data-testid="gallery-shared-video"]');
  173 |   await expect(gallerySharedVideo).toBeVisible();
  174 |   const activeVideo = gallerySharedVideo.locator("video");
  175 |   await expect(activeVideo).toHaveJSProperty("muted", true);
  176 |   await expect.poll(async () => activeVideo.evaluate((video) => video.paused)).toBe(false);
  177 |   const before = await gallerySharedVideo.boundingBox();
  178 |   expect(before).not.toBeNull();
  179 |   await page.waitForTimeout(600);
  180 |   const openBox = await gallerySharedVideo.boundingBox();
  181 |   const openPlayerBox = await gallerySharedVideo.locator('[data-video-player="true"]').boundingBox();
  182 |   const openVideoBox = await activeVideo.boundingBox();
  183 |   expect(openBox).not.toBeNull();
  184 |   expect(openPlayerBox).not.toBeNull();
  185 |   expect(openVideoBox).not.toBeNull();
  186 |   const galleryBox = await page.locator('[data-testid="gallery-touch-layer"]').boundingBox();
  187 |   expect(galleryBox).not.toBeNull();
  188 |   expect(openBox.width).toBeGreaterThan(galleryBox.width * 0.8);
  189 |   expect(openBox.height).toBeGreaterThan(galleryBox.height * 0.8);
  190 |   expect(openPlayerBox.width).toBeGreaterThan(openBox.width * 0.9);
  191 |   expect(openPlayerBox.width).toBeLessThan(openBox.width * 0.98);
> 192 |   expect(openPlayerBox.height).toBeGreaterThan(openBox.height * 0.9);
      |                                ^ Error: expect(received).toBeGreaterThan(expected)
  193 |   expect(openPlayerBox.height).toBeLessThan(openBox.height * 0.98);
  194 |   expect(Math.abs((openPlayerBox.x + openPlayerBox.width / 2) - (openBox.x + openBox.width / 2))).toBeLessThan(2);
  195 |   expect(Math.abs((openPlayerBox.y + openPlayerBox.height / 2) - (openBox.y + openBox.height / 2))).toBeLessThan(2);
  196 |   expect(openVideoBox.width).toBeGreaterThan(100);
  197 |   expect(openVideoBox.height).toBeGreaterThan(100);
  198 | 
  199 |   const touchLayer = page.locator('[data-testid="gallery-touch-layer"]');
  200 |   await dispatchSwipeDown(touchLayer);
  201 | 
  202 |   // AnimatePresence keeps the gallery mounted during the FLIP exit. Both the
  203 |   // card target and the exiting gallery source must coexist for the handoff.
  204 |   await expect(cardSharedMedia).toHaveCount(2);
  205 |   await page.waitForTimeout(50);
  206 |   const during = await gallerySharedVideo.boundingBox();
  207 |   expect(during).not.toBeNull();
  208 |   expect(Math.abs(during.y - before.y) + Math.abs(during.x - before.x)).toBeGreaterThan(1);
  209 |   await page.waitForTimeout(500);
  210 |   await expect(cardSharedMedia).toHaveCount(1);
  211 |   await expect(page.locator('[data-testid="album-gallery"]')).toHaveCount(0);
  212 | 
  213 |   // The second video is not the album-cover shared element. Verify that
  214 |   // carousel navigation still renders it and that its swipe-down close path
  215 |   // completes without freezing or leaving the overlay mounted.
  216 |   await page.locator('[data-testid="album-card-photo"]').click();
  217 |   await expect(page.locator('[data-testid="album-gallery"]')).toBeVisible();
  218 |   await page.keyboard.press("ArrowRight");
  219 |   await page.waitForTimeout(150);
  220 |   const secondVideo = page.locator('[data-testid="carousel-track"] [data-media-id="video-photo-2"] video');
  221 |   await expect(secondVideo).toHaveCount(1);
  222 |   await expect(secondVideo).toHaveJSProperty("muted", true);
  223 |   await expect.poll(async () => secondVideo.evaluate((video) => video.paused)).toBe(false);
  224 |   await expect.poll(async () => activeVideo.evaluate((video) => video.paused)).toBe(true);
  225 |   await dispatchSwipeDown(page.locator('[data-testid="gallery-touch-layer"]'));
  226 |   await page.waitForTimeout(400);
  227 |   await expect(page.locator('[data-testid="album-gallery"]')).toHaveCount(0);
  228 | });
  229 | 
```