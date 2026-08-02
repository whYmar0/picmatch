# Video UX Improvement Spec — Instagram-Style Controls

## Goal

Improve the video experience in `AlbumGallery.jsx` (gallery mode) and `VotePage.jsx` (voting mode) to match Instagram-style interaction conventions:

1. **Adaptive aspect ratio** — video never crops, always `object-contain` in all contexts.
2. **Instagram-style controls** — hold anywhere to pause, tap center to pause, mute button above pause icon, horizontal swipe on bottom area → timeline scrub.
3. **Swipe-to-dismiss on video** — vertical swipe down (starting anywhere on the video) closes gallery with the same animation as photos.
4. **Exit animation parity** — closing a video slide uses the identical dismiss animation as closing a photo.

---

## Current State & Problems

### Current Code Locations
- `frontend/src/components/AlbumGallery.jsx` lines **1168–1200** — two identical `<video controls>` blocks.
- `frontend/src/utils/media.js` — `isVideo(photo)` detection utility.
- `frontend/src/components/ImageLightbox.jsx` lines **111–122** — `touchStartedOnVideo` guard that blocks swipe-to-dismiss when touch starts on video.
- `frontend/src/pages/VotePage.jsx` line **419** — video with `object-cover` (wrong, causes crop).

### Problems Found in Code

**P1: Swipe-to-dismiss blocked on video** — `<video>` has `style={{ touchAction: "auto" }}` and `pointer-events-auto`, so the browser's native seekbar intercepts `touchstart`/`touchmove` before the gallery gesture handler can axis-lock them.

**P2: No adaptive aspect ratio** — `object-contain` is used but without measuring `videoWidth/videoHeight` on `loadedmetadata`, some Android browsers overflow the container.

**P3: Native browser controls bar** — `controls` attribute renders an inconsistent native UI that does not match the app's design.

**P4: VotePage crops video** — `object-cover` crops portrait videos in 4:3 voting cards.

---

## Interaction Model — Instagram-Style (Detailed)

### Playback Behavior
| Event | Action |
|---|---|
| Video opens / slide enters view | Auto-play with sound (`autoPlay`, `playsInline`, NOT `muted`) |
| Finger **presses and holds** anywhere on video | **Pause** (hold-to-pause), no UI change needed during hold |
| Finger **releases** after hold | **Resume** playback |
| **Tap** in the center region (center 50% of video width × center 60% of height) | Toggle play/pause |
| When paused by any method | Show **pause icon** (big circle + Pause icon) at center |
| **Tap the mute button** (small circle above the pause icon) | Toggle mute/unmute. Does NOT affect play state. |
| **Horizontal swipe in the bottom 25% of video** | Show timeline bar + scrub to seek position |
| **Vertical swipe down** on the video | Close gallery (same as photo dismiss) |

### Controls Overlay Layout

```
┌─────────────────────────────────┐
│                                 │
│         (video frame)           │
│                                 │
│         ┌────────┐              │
│         │  🔇/🔊 │  ← small mute button (32px circle, top-left of pause)
│         └────────┘              │
│         ┌────────────┐          │
│         │     ⏸      │  ← pause icon (56px circle, semi-transparent bg)
│         └────────────┘          │
│                                 │
│  ▓▓▓▓░░░░░░░░░░░  0:14 / 1:23  │  ← timeline bar (bottom 25%, visible only when scrubbing)
└─────────────────────────────────┘
```

- **Pause circle:** 56px, `bg-black/50 backdrop-blur-sm`, white `Pause` or `Play` icon (size 24), Lucide icons.
- **Mute button:** 32px circle, `bg-black/50 backdrop-blur-sm`, white `Volume2` (unmuted) or `VolumeX` (muted) icon (size 16), Lucide icons. Positioned **12px above the top edge** of the pause circle.
- **Timeline bar:** visible only during scrub gesture. Full-width `<input type="range">` at the bottom of the video container. Shows current time + total duration in white `text-xs`.
- When video is **playing and not being scrubbed**, all controls are **hidden** (opacity 0).
- When paused, **pause icon + mute button are visible**. Timeline is hidden unless user starts a scrub gesture.

---

## Architecture: `VideoPlayer.jsx` Component

Create `frontend/src/components/VideoPlayer.jsx`. This component is self-contained and handles all gesture logic internally, then **forwards unhandled vertical-swipe gesture events up to the parent** via a `onVerticalSwipe(deltaY)` prop so the gallery can dismiss.

### Props
```typescript
interface VideoPlayerProps {
  src: string;
  className?: string;           // applied to the outer container div
  style?: React.CSSProperties;  // applied to the outer container div
  onVerticalSwipe?: (deltaY: number) => void;   // called on touchend with cumulative Y delta
  onVerticalSwipeMove?: (deltaY: number) => void; // called per-frame during vertical drag (for dismiss preview)
}
```

### Internal State
```javascript
const videoRef = useRef(null);
const [paused, setPaused] = useState(false);
const [muted, setMuted] = useState(false);
const [currentTime, setCurrentTime] = useState(0);
const [duration, setDuration] = useState(0);
const [aspect, setAspect] = useState(null);       // width/height ratio
const [showTimeline, setShowTimeline] = useState(false);

// Touch tracking
const holdTimer = useRef(null);        // for hold-to-pause detection
const touchStartRef = useRef(null);    // { x, y, time }
const isHolding = useRef(false);       // true while finger is held down
const isScrubbing = useRef(false);     // true when horizontal bottom-area scrub
const gestureAxis = useRef(null);      // "x" | "y" | null
```

### Gesture Logic

**On `touchstart`:**
```javascript
touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
gestureAxis.current = null;
isScrubbing.current = false;

// Hold-to-pause: if finger stays > 120ms → pause
holdTimer.current = setTimeout(() => {
  isHolding.current = true;
  videoRef.current.pause();
  setPaused(true);
}, 120);
```

**On `touchmove`:**
```javascript
const dx = e.touches[0].clientX - touchStartRef.current.x;
const dy = e.touches[0].clientY - touchStartRef.current.y;

// Axis-lock at 12px
if (!gestureAxis.current && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
  gestureAxis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

if (gestureAxis.current === "x") {
  // Scrub: only if touch started in bottom 25% of container
  if (isInBottomArea(touchStartRef.current.y, containerRef.current)) {
    clearTimeout(holdTimer.current); isHolding.current = false;
    isScrubbing.current = true;
    setShowTimeline(true);
    const pct = clamp((e.touches[0].clientX - containerRef.current.getBoundingClientRect().left) 
                      / containerRef.current.clientWidth, 0, 1);
    videoRef.current.currentTime = pct * duration;
    setCurrentTime(videoRef.current.currentTime);
    e.stopPropagation(); // don't let gallery switch slides
  }
}

if (gestureAxis.current === "y") {
  clearTimeout(holdTimer.current); isHolding.current = false;
  // Forward to parent for dismiss handling
  onVerticalSwipeMove?.(dy);
}
```

**On `touchend`:**
```javascript
clearTimeout(holdTimer.current);

if (isScrubbing.current) {
  isScrubbing.current = false;
  setTimeout(() => setShowTimeline(false), 800); // hide timeline 800ms after scrub ends
  return;
}

if (gestureAxis.current === "y") {
  onVerticalSwipe?.(dy); // parent handles dismiss
  return;
}

if (isHolding.current) {
  // Resume on release
  isHolding.current = false;
  videoRef.current.play(); setPaused(false);
  return;
}

// Pure tap — detect if in center region
const rect = containerRef.current.getBoundingClientRect();
const relX = (touchStartRef.current.x - rect.left) / rect.width;
const relY = (touchStartRef.current.y - rect.top) / rect.height;
if (relX > 0.25 && relX < 0.75 && relY > 0.2 && relY < 0.8) {
  // Center tap → toggle play/pause
  if (videoRef.current.paused) {
    videoRef.current.play(); setPaused(false);
  } else {
    videoRef.current.pause(); setPaused(true);
  }
}
```

**Mute button `onClick`:**
```javascript
(e) => {
  e.stopPropagation(); // must not bubble to video container
  const newMuted = !muted;
  videoRef.current.muted = newMuted;
  setMuted(newMuted);
}
```

---

## Integration in `AlbumGallery.jsx`

Replace both `<video>` blocks (lines ~1168–1200) with `<VideoPlayer>`:

```jsx
import VideoPlayer from "./VideoPlayer";

// Inside slide render, where photoIsVideo is true:
<VideoPlayer
  src={photo.url}
  className={photoClassName}
  onVerticalSwipeMove={(dy) => {
    // drive dragY and dragProgressMV for live dismiss preview
    const newDragY = touchStartDragY.current + dy;
    dragY.set(Math.max(0, newDragY));
    if (dragProgressMV) {
      dragProgressMV.set(Math.max(0, Math.min(1, newDragY / (vh * 0.5))));
    }
  }}
  onVerticalSwipe={(dy) => {
    // Same decision logic as Y-axis branch in onWrapperTouchEnd
    if (dy > 100) {
      isExitingRef.current = true;
      setIsExiting(true);
      galleryRef.current?.setAttribute("inert", "");
      onClose();
    } else {
      // Snap back
      dragYAnimRef.current = animate(dragY, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }}
/>
```

**Critical:** The `<motion.div>` gallery touch wrapper (`onTouchStart={onWrapperTouchStart}`) should NOT fire for video slides because `VideoPlayer` calls `e.stopPropagation()` for horizontal (scrub) gestures. Vertical gestures are forwarded through the `onVerticalSwipe` prop, not through DOM event bubbling.

---

## Swipe-to-Dismiss Fix in `ImageLightbox.jsx`

Remove `touchStartedOnVideo` ref guard (lines 89, 111–122, 144–154).
Replace `<video controls>` in the lightbox with `<VideoPlayer>`.
`VideoPlayer`'s `onVerticalSwipe` prop calls the lightbox's `onClose()` when `dy > 80`.

---

## VotePage Fix

`VotePage.jsx` line 419 — change from:
```jsx
<video ... className="w-full h-full object-cover" muted playsInline />
```
to:
```jsx
<video ... className="w-full h-full object-contain" autoPlay muted playsInline loop />
```
In voting thumbnails use `object-contain` with a black background (`bg-black`) on the container so letterboxing looks intentional.

---

## Files to Create / Modify

| File | Action | Key Change |
|---|---|---|
| `frontend/src/components/VideoPlayer.jsx` | **[NEW]** | Instagram-style video player component |
| `frontend/src/components/AlbumGallery.jsx` | Modify lines ~1168–1200 | Replace raw `<video>` with `<VideoPlayer>` |
| `frontend/src/pages/VotePage.jsx` | Modify line ~419 | `object-cover` → `object-contain`, add `autoPlay loop` |
| `frontend/src/components/ImageLightbox.jsx` | Modify lines 89, 111–122, 144–154 | Remove video guard, use `VideoPlayer` |

---

## Self-Test Protocol

Login: `http://localhost:5173`, Email: `tester@example.com`, Password: `Test1234!A`

| # | Scenario | Expected |
|---|---|---|
| 1 | Open gallery on video slide | Auto-plays with sound. No native controls bar. |
| 2 | Hold finger anywhere on video for 0.5s | Video pauses. Pause icon + mute button appear. Release → resumes. |
| 3 | Tap center of paused video | Resumes playback. Icons hide. |
| 4 | Tap mute button | Sound mutes. Icon changes to VolumeX. Video does NOT pause. Tap again → unmutes. |
| 5 | Swipe down on video | Gallery closes with same dim+scale dismiss as photos. Dashboard interactive. |
| 6 | Horizontal swipe on bottom 25% area | Timeline bar appears. Video seeks to dragged position. Timeline hides after 800ms. |
| 7 | Horizontal swipe on UPPER area of video | Gallery does NOT scrub (no axis conflict). Gallery may slide to next photo if above threshold. |
| 8 | Portrait 9:16 video | No cropping. Pillarboxed in a landscape viewport. |
| 9 | VotePage with portrait video | `object-contain` in voting card. No crop. |

Fail any test → investigate root cause, fix, re-run all 9.

---

## Constraints

- No new npm packages. Use only React, Framer Motion, Lucide React, TailwindCSS.
- Do NOT add `controls` attribute to any `<video>`. All controls are custom.
- Preserve gallery axis-lock system (`gestureAxis`, `onWrapperTouchStart/Move/End`).
- Preserve all existing props and callbacks for `AlbumGallery`, `VotePage`, `ImageLightbox`.
- No backend changes required.
