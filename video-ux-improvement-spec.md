# Video UX Improvement Spec — AlbumGallery & VotePage

## Goal

Improve the video experience in `AlbumGallery.jsx` (gallery mode) and `VotePage.jsx` (voting mode) to match YouTube-style interaction conventions:

1. **Adaptive aspect ratio** — video never crops, always letterboxed to the actual video dimensions.
2. **Custom controls** — tap center to play/pause, tap again to show/hide controls overlay. No native browser controls bar.
3. **Swipe-to-dismiss on video** — the same vertical swipe-down gesture that closes photos must work identically when the user swipes directly on top of a video.
4. **Exit animation parity** — closing a video slide uses the identical dismiss animation as closing a photo.

---

## Current State & Problems

### Current Code Location
- Video is rendered in `frontend/src/components/AlbumGallery.jsx` at lines **1168–1200** (two identical `<video>` blocks for the shared-element slide and all other slides).
- Video detection uses the utility `isVideo(photo)` from `frontend/src/utils/media.js`.
- The gallery gesture layer (`onWrapperTouchStart / onWrapperTouchMove / onWrapperTouchEnd`) lives in `AlbumGallery.jsx` lines ~680–815.
- `frontend/src/components/ImageLightbox.jsx` has a separate swipe-on-video bug at lines 111–122 (`touchStartedOnVideo.current = true` → returns early → swipe ignored).

### Problems Found in Code

**Problem 1: Swipe-to-dismiss blocked on video (AlbumGallery.jsx)**
The gallery touch layer is `<motion.div onTouchStart={onWrapperTouchStart} ...>`. The `<video>` element has `style={{ touchAction: "auto" }}` and `pointer-events-auto`. The browser's video element **intercepts** `touchstart` and `touchmove` events by default, sending them to the video's native seekbar. `onWrapperTouchStart` fires but `e.preventDefault()` is only called in `onWrapperTouchMove` **after** axis-locking (line ~714). By then the browser has already handed the gesture to the video element's internal scrubber. Result: vertical swipes on video do not trigger dismiss.

**Problem 2: No adaptive aspect ratio**
Current video class is `max-w-full max-h-full` with `object-contain`. This is correct CSS, but the containing `<div>` has class `flex items-center justify-center py-8`. When the video's natural dimensions are known only after `loadedmetadata`, the browser resizes the element — but since the container uses flexbox and fixed height (`h-full`), any video narrower than the viewport appears with pillarboxes. There is no `aspect-ratio` constraint applied, meaning on some Android browsers the video element ignores `max-h-full` and overflows if `object-contain` is applied without an explicit width/height pair.

**Problem 3: Native browser controls**
Both `<video>` blocks have `controls` attribute. This renders the native browser UI (seekbar, fullscreen button, volume slider). The appearance differs across Chrome, Safari, and Firefox Android and does not match the app's visual language.

**Problem 4: No play/pause tap-to-toggle**
With native `controls`, tapping anywhere on the video shows/hides the browser bar. There is no custom "tap center to toggle playback" interaction.

**Problem 5: VotePage video**
`VotePage.jsx` line 419: `<video ... className="w-full h-full object-cover" muted playsInline />`. Videos in voting cards use `object-cover` (cropping) rather than `object-contain`. A 9:16 portrait video inside a 4:3 card viewport will have top/bottom cropped heavily.

---

## Required Changes

### A. Adaptive Aspect Ratio

The video element must never crop. Use `object-contain` with `max-w-full max-h-full` **and** listen to `onLoadedMetadata` to set a correct `aspect-ratio` style so the browser knows the exact dimensions. This eliminates overflow in strict-viewport containers.

```jsx
const [videoAspect, setVideoAspect] = useState(null);

<video
  ...
  onLoadedMetadata={(e) => {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) {
      setVideoAspect(v.videoWidth / v.videoHeight);
    }
  }}
  style={{
    aspectRatio: videoAspect ? `${videoAspect}` : undefined,
    maxWidth: "100%",
    maxHeight: "100%",
    width: videoAspect && videoAspect < 1 ? "auto" : "100%",
    height: videoAspect && videoAspect < 1 ? "100%" : "auto",
    objectFit: "contain",
  }}
/>
```

In `VotePage.jsx`, change `object-cover` → `object-contain` for video. Cards may show letterboxing for non-4:3 videos, which is correct — never crop.

### B. Custom Controls (YouTube-style)

Remove native `controls` attribute from all `<video>` elements in `AlbumGallery.jsx`.

Create a new React component **`VideoPlayer`** (in `frontend/src/components/VideoPlayer.jsx`) that wraps `<video>` with a custom overlay:

**Behavior spec:**
- **Single tap** on the video: toggle play/pause. No controls overlay shows on first tap.
- **Any tap while paused**: play, hide overlay after 2.5 s auto-hide timeout.
- **Any tap while playing**: pause and show controls overlay. Another tap re-hides controls without changing play state.
- **Controls overlay** contains:
  - Large play/pause icon centered (Lucide `Play` / `Pause`, size 56, white with semi-transparent circular bg).
  - Bottom bar: thin seek slider (current time / duration), current time text, total duration text.
  - No volume control (mobile audio is always on).
  - Controls overlay fades in with `opacity: 1` over 150 ms, auto-hides after 2.5 s of inactivity.
- **Color theme:** Black semi-transparent overlay (`bg-black/40`), white icons/text. Matches the existing dark gallery aesthetic.
- **Progress bar:** thin `<input type="range">` styled like the gallery's existing pill/bar elements. On `change`: seek via `videoRef.current.currentTime = value`.

**Auto-hide logic:**
```javascript
const showControls = () => {
  setControlsVisible(true);
  clearTimeout(hideTimer.current);
  hideTimer.current = setTimeout(() => setControlsVisible(false), 2500);
};
const togglePlayback = () => {
  if (videoRef.current.paused) {
    videoRef.current.play();
  } else {
    videoRef.current.pause();
  }
  showControls();
};
```

**VideoPlayer usage in AlbumGallery.jsx:**
```jsx
// Replace both <video> blocks at lines 1168-1175 and 1193-1200 with:
<VideoPlayer
  src={photo.url}
  className={photoClassName}
  onSwipeDown={...}  // forward swipe gesture to parent
/>
```

### C. Swipe-to-Dismiss on Video

This is the most technically complex change. The gallery's swipe dismiss relies on `onWrapperTouchStart` / `onWrapperTouchMove` / `onWrapperTouchEnd` on the parent `<motion.div>`. A `<video>` element without `controls` does not capture `touchstart` events — the browser passes them up to the parent element. **With `controls` removed**, the parent handler will receive all touch events and vertical swipe dismiss will work automatically.

**Steps:**
1. Remove `controls` attribute from `<video>` elements (replaced by custom `VideoPlayer` overlay above).
2. Remove `style={{ touchAction: "auto" }}` and `pointer-events-auto` from the video element — instead set `pointer-events-none` on the `<video>` and `pointer-events-auto` on the overlay div.
3. The overlay div's `onTouchStart` and `onTouchEnd` handlers manage play/pause toggle.
4. Forward `touchstart` / `touchmove` / `touchend` events from the overlay up to the gallery wrapper by NOT calling `e.stopPropagation()`. This allows both: the gallery to detect axis-locking (vertical = dismiss, horizontal = carousel slide), AND the overlay to detect tap for play/pause.
5. Axis detection happens at ~12px of movement — a pure tap (< 12px movement) fires play/pause; a swipe > 12px vertical triggers dismiss.

**In `onWrapperTouchMove`**, after axis lock to "y", `e.preventDefault()` is called. This prevents the `<video>` (even without `controls`) from initiating any drag selection. This is already correctly done.

**Remove** `touchStartedOnVideo.current` logic from `ImageLightbox.jsx` (lines 89, 111–122) — the same fix applies: with `controls` removed and `pointer-events-none` on `<video>`, the lightbox outer div catches all touch events and swipe-down dismiss works on video exactly as on images.

### D. Exit Animation Parity

The current `<video>` elements are NOT wrapped in `<motion.img layoutId>` like the first photo is. Videos therefore have no shared-element FLIP on close. This is acceptable — what must match is the **opacity and scale exit**:
- Ensure the gallery root `motion.div exit={{ opacity: 0, transition: { duration: 0.22 } }}` applies uniformly to video slides (it does, since it wraps the entire gallery).
- Ensure `dragY` and `combinedTranslateY` apply to the `<motion.div>` at line 1119 — verify the `VideoPlayer` wrapper inherits this scale/translate chain correctly.
- Do NOT add a `layoutId` to video elements.

---

## Files to Modify

| File | Changes |
|---|---|
| `frontend/src/components/VideoPlayer.jsx` | **[NEW]** Custom video player with tap-to-toggle, auto-hide controls overlay, seek bar |
| `frontend/src/components/AlbumGallery.jsx` | Replace raw `<video>` elements (lines ~1168–1200) with `<VideoPlayer>`. Remove `controls`, `touchAction: "auto"`, `pointer-events-auto`. |
| `frontend/src/pages/VotePage.jsx` | Change video thumbnail from `object-cover` → `object-contain`. |
| `frontend/src/components/ImageLightbox.jsx` | Remove `touchStartedOnVideo` logic (lines 89, 111–122, 144–154). Replace with `VideoPlayer` for video lightbox mode. |

---

## Self-Test Protocol

After implementation, test the following scenarios using `http://localhost:5173` with credentials:
- **Email:** `tester@example.com` / **Password:** `Test1234!A`

**Test 1 — Aspect ratio: portrait video (9:16)**
- Upload a portrait video (e.g. smartphone footage 1080×1920).
- Open gallery.
- Verify: video shows with top/bottom letterboxing (black bars on sides of a wide phone screen), not cropped.

**Test 2 — Aspect ratio: landscape video (16:9)**
- Upload a landscape video (e.g. 1920×1080).
- Open gallery.
- Verify: video fills full width, pillarboxes if any are minimal, no crop.

**Test 3 — Play/pause tap toggle**
- Open gallery on a video slide.
- Tap the center of the video.
- Verify: video plays. Controls visible for 2.5 s then hide.
- Tap again while playing.
- Verify: video pauses. Controls show.

**Test 4 — Swipe-to-dismiss from video**
- Open gallery on a video slide.
- Place finger on the video (not a blank area).
- Swipe down 120 px and release.
- Verify: gallery closes with the same dim + fade exit animation as photos. Dashboard is immediately interactive.

**Test 5 — Swipe-to-dismiss does NOT interrupt seek**
- While a video plays, tap to show controls.
- Touch the seek bar and drag horizontally.
- Verify: the gallery does NOT dismiss (axis lock detects "x" gesture, not "y").

**Test 6 — VotePage video no-crop**
- Navigate to a voting album with a portrait video.
- Verify: video shows letterboxed in the voting card, not cropped.

**Test 7 — Controls auto-hide**
- Open video. Tap to show controls. Wait 2.5 s without touching.
- Verify: controls overlay fades out automatically.

If any test fails, investigate root cause, fix, and re-run all 7 tests before marking complete.

---

## Constraints

- Do NOT use any new npm packages. Use only existing dependencies: React, Framer Motion, Lucide React, TailwindCSS.
- Do NOT remove the axis-lock gesture system in `AlbumGallery.jsx`.
- Do NOT add `controls` attribute to any `<video>` element — all controls must be custom.
- Preserve all existing props and behavior for `AlbumGallery`, `VotePage`, and `ImageLightbox`.
- Backend changes are NOT required for this task.
