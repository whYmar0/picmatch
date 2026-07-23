# Swipe System Rewrite — AlbumGallery Photo Viewer

## Goal

Completely rewrite the horizontal swipe navigation and ThumbStrip in `AlbumGallery.jsx` to achieve native-grade responsiveness identical to the photo galleries in Android/iOS. The current implementation is sluggish on fast swipes, loses synchronization between the main carousel and the thumbnail strip, and exhibits visual lag. After this rewrite, the viewer must feel instant, frictionless, and jank-free at any swipe speed.

---

## Current Problems to Eliminate

### Main Carousel
- **Slow reaction to fast flicks** — the spring-snap `animate()` call fires only in `onWrapperTouchEnd`. During the gesture, `dragX` drives the track via `useTransform`, but the spring parameters (`stiffness: 300, damping: 30`) are too soft, causing the snap to visually lag 200–400 ms behind a fast finger flick.
- **Double-update path** — `setCurrentIdx(targetIdx)` (React state) is called inside `snapAnimRef.onComplete`, which forces a React re-render mid-animation. `dragX.set(0)` then fires after the React commit, causing a subtle frame where `carouselX` jumps from `-(N * w) + dragX` to `-(N * w)` before the new `currentIdx` takes effect, producing a visible snap discontinuity.
- **No progressive rendering** — photos far from `currentIdx` are virtualized with `Math.abs(i - currentIdx) <= 2`, but there is no pre-loading of the next/previous photos' images during a swipe, causing blank frames on fast transitions.

### ThumbStrip
- **Broken on fast swipe** — `ThumbStrip` uses native `overflow-x: auto` with a `scroll` event listener and `requestAnimationFrame`. When the user swipes the thumbnail strip quickly, the scroll position changes faster than one RAF cycle, causing `onSelect` to be called with stale intermediate indices. Worse, `selectingRef.current` is set to `true` during programmatic `centerThumb()` calls, which briefly suppresses `onSelect` — on fast sequences this suppression window overlaps with genuine user scroll events, causing the strip to silently stop tracking for 300 ms at a time.
- **No real-time photo tracking** — `currentIdx` state drives `centerThumb()` via a `useEffect`. Since `currentIdx` is a React state updated inside `snapAnimRef.onComplete` (after the spring settles), the ThumbStrip highlight does not update until the snap animation finishes — typically 150–300 ms after the user's finger lifts.
- **Thumb drag does not mirror main photo** — dragging a finger across the thumb strip scrolls it natively, but the highlight (ring + scale) only updates on `onSelect`, which fires from the `scroll` event via RAF. This is 1–3 frames behind the scroll position, creating visible highlight lag.

---

## Target Behavior

### Main Carousel
1. **Instant response** — The photo track must follow the user's finger with zero latency using a `useMotionValue`-driven transform on the compositor thread. No React state updates during an active gesture.
2. **Velocity-aware snap** — On finger release, compute projected landing position using `(dx + velocity * 200)` and snap to the nearest integer index using a fast spring (`stiffness: 500, damping: 38, mass: 0.6`). If the projected landing is past 0.25× the container width, advance/retreat by one photo.
3. **No React re-render mid-animation** — After snap completes, update `currentIdxRef.current` synchronously. Only call `setCurrentIdx()` (React state) after the snap spring settles, in `onComplete`. Never call `dragX.set(0)` while the spring is running — instead, the carousel track reads from a single motion value that already encodes the new origin.
4. **Correct carouselX formula** — Use a single motion value `offsetX` (replaces `dragX`) that represents the track's absolute pixel offset. The transform is simply `style={{ x: offsetX }}`. When snapping to index N, animate `offsetX` to `-(N * containerWidth)` directly — no `currentIdx * w + dragX` decomposition. This eliminates the double-update jump.

### ThumbStrip
1. **Real-time sync with `currentIdxRef`** — The active thumb highlight must track `currentIdxRef.current`, not `currentIdx` state. Use a Framer Motion `useMotionValue` (e.g. `idxMV`) that is updated synchronously in every frame where `offsetX` changes, derived via `useTransform`. The active thumb index is `Math.round(-offsetX / containerWidth)`.
2. **Touch-driven scrubbing** — Replace native `overflow-x: auto` scroll with a touch-driven transform on the thumb track (same pattern as the main carousel but for thumbnails). Dragging the thumb strip must **directly drive the main photo** — i.e. thumb strip drag → update `offsetX` → main photo moves in real time, without going through React state at all.
3. **No 300 ms suppression window** — Remove `selectingRef` / `selectTimer` entirely. The synchronization between main carousel and thumb strip is guaranteed by both reading from the same `offsetX` motion value.
4. **Center-scroll** — Animate the thumb strip to keep the active thumb centered. Use a separate `thumbOffsetX` motion value (`useTransform` of `offsetX`) so centering is automatic and compositor-driven, never requiring `scrollTo()`.

---

## Architecture: Single Source of Truth

Both the main carousel and the thumb strip must read from **one** motion value: `offsetX`.

```
offsetX (useMotionValue)
  ├── Main carousel track: style={{ x: offsetX }}
  ├── Thumb strip track:   style={{ x: thumbOffsetX }}   (useTransform of offsetX)
  └── Active index:        Math.round(-offsetX.get() / W) (read in onComplete / sync via subscriber)
```

This replaces:
- `dragX` + `currentIdx * w` decomposition
- Native `overflow-x: auto` on ThumbStrip
- `scroll` event listener on ThumbStrip
- `selectingRef` / `selectTimer` suppression

---

## Implementation Instructions

### File to rewrite: `frontend/src/components/AlbumGallery.jsx`

**IMPORTANT**: Do not change any component other than `AlbumGallery.jsx` and `ThumbStrip` (which lives inside the same file). Do not change the backend, routing, Dashboard, BottomSheet, or any other component. Preserve all existing props and callback interfaces (`onClose`, `startPhotoId`, `dragProgressMV`, etc.) exactly.

---

### Step 1 — Read the entire file before writing anything

Read all 1100+ lines of `AlbumGallery.jsx`. Understand every motion value, every ref, every `useEffect`, and every touch handler before touching a single line.

---

### Step 2 — Replace the carousel motion model

**Remove:**
- `const dragX = useMotionValue(0)`
- `const carouselX = useTransform(dragX, (x) => -(currentIdxRef.current * w) + x)`
- All references to `touchStartDragX`

**Add:**
```js
// containerWidth is measured once on mount and on resize
const containerWidthRef = useRef(window.innerWidth);
useEffect(() => {
  const measure = () => {
    if (carouselRef.current) containerWidthRef.current = carouselRef.current.clientWidth;
  };
  measure();
  window.addEventListener("resize", measure);
  return () => window.removeEventListener("resize", measure);
}, []);

// Single source of truth: absolute track offset in pixels
// Initial value positions the track at startPhotoId's index
const offsetX = useMotionValue(() => -(initialIdx * containerWidthRef.current));
```

The carousel track renders as:
```jsx
<motion.div className="flex h-full" style={{ x: offsetX, willChange: "transform" }}>
```

Where `initialIdx` is derived from `startPhotoId` exactly as `currentIdx` was before.

---

### Step 3 — Rewrite touch handlers to operate on `offsetX` directly

**`onWrapperTouchStart`:**
```js
// Stop any in-flight snap
snapAnimRef.current?.stop();
dragYAnimRef.current?.stop();
touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
touchStartOffsetX.current = offsetX.get();  // snapshot current absolute offset
gestureAxis.current = null;
```

**`onWrapperTouchMove` (X branch):**
```js
const raw = touchStartOffsetX.current + dx;
const W = containerWidthRef.current;
const minX = -(photos.length - 1) * W;
const maxX = 0;

// Rubber-band clamping at edges
let clamped = raw;
if (raw > maxX) clamped = maxX + (raw - maxX) * 0.2;
if (raw < minX) clamped = minX + (raw - minX) * 0.2;
offsetX.set(clamped);
```

**`onWrapperTouchEnd` (X branch):**
```js
const W = containerWidthRef.current;
const vel = info.velocity ?? (dx / Math.max(dt, 1)); // px/ms
const projected = offsetX.get() + vel * 180;         // 180 ms projection window

let targetIdx = Math.round(-projected / W);
targetIdx = Math.max(0, Math.min(targetIdx, photos.length - 1));

const targetOffset = -(targetIdx * W);

snapAnimRef.current = animate(offsetX, targetOffset, {
  type: "spring",
  stiffness: 500,
  damping: 38,
  mass: 0.6,
  onComplete: () => {
    if (isDismissingRef.current) return;
    currentIdxRef.current = targetIdx;
    setCurrentIdx(targetIdx);          // React state update ONLY after spring settles
  },
});
```

---

### Step 4 — Rewrite ThumbStrip

Replace the existing `ThumbStrip` function entirely. The new implementation:

1. **Uses no `overflow-x: auto`** — the thumb track is a `<motion.div>` with `style={{ x: thumbOffsetX }}`.
2. **Derives `thumbOffsetX` from the main `offsetX`:**
```js
const thumbOffsetX = useTransform(offsetX, (x) => {
  const W = containerWidthRef.current;
  const idx = -x / W;                          // fractional index (0.0 to N-1.0)
  const centeredX = -(idx * (THUMB_SIZE + THUMB_GAP)) + stripHalfWidth;
  return centeredX;
});
```
Where `stripHalfWidth` = half the visible thumb strip container width (measured once with a `ResizeObserver`).

3. **Active thumb derived from `offsetX`** — subscribe to `offsetX` changes and compute the active index in a `useEffect`:
```js
useEffect(() => {
  const W = containerWidthRef.current;
  const unsub = offsetX.on("change", (x) => {
    const idx = Math.max(0, Math.min(Math.round(-x / W), photos.length - 1));
    // update a local motionValue for active highlight, not React state
    activeIdxMV.set(idx);
  });
  return unsub;
}, [offsetX, photos.length]);
```

4. **Thumb tap** — tapping a thumb at index `i` animates `offsetX` to `-(i * W)` with the same spring, which automatically moves the main photo and re-centers the strip.

5. **Thumb strip drag** — implement separate `onThumbTouchStart / onThumbTouchMove / onThumbTouchEnd` handlers on the thumb strip container that directly modify `offsetX` (same rubber-band logic as the main carousel, but inverted: dragging the strip left moves the photo right).

---

### Step 5 — Self-Test Protocol

After implementing, run the following tests **yourself** using the webapp testing skill (Playwright):

#### Test A — Slow single swipe
1. Open gallery on an album with 4+ photos.
2. Slowly swipe photo from index 0 → index 1.
3. Verify: photo snaps cleanly, ThumbStrip highlight moves to index 1 during the swipe (not after).

#### Test B — Fast flick sequence
1. Open gallery on an album with 5+ photos.
2. Flick quickly: photo 0 → 1 → 2 → 3 in rapid succession (< 300 ms between flicks).
3. Verify: no photos are skipped, no blank frames, final index matches the number of flicks performed.
4. Verify: ThumbStrip highlight is correct after the last flick settles.

#### Test C — Thumb strip tap
1. Open gallery. Tap thumb at index 3.
2. Verify: main photo moves to index 3. ThumbStrip centers on thumb 3.
3. Tap thumb at index 0. Verify: main photo returns to index 0.

#### Test D — Thumb strip drag
1. Open gallery with 6+ photos.
2. Drag the thumb strip from left to right slowly.
3. Verify: main photo tracks the drag in real time (moves fractionally as you drag).
4. Release at an intermediate position. Verify: main photo snaps to nearest integer index.
5. Drag the thumb strip very fast (flick). Verify: main photo advances to the projected index.

#### Test E — Mixed interaction (main swipe + thumb tap)
1. Swipe main photo to index 2. Immediately tap thumb at index 4.
2. Verify: no visual glitch, photo moves to index 4 correctly.

#### Test F — Edge rubber-band
1. On index 0, try to swipe right (past the first photo).
2. Verify: rubber-band resistance is applied (track moves at 20% of finger speed).
3. Release. Verify: track snaps back to index 0 without overshoot artifacts.

#### Test G — Dismiss from non-zero index
1. Swipe to photo index 2.
2. Swipe down to dismiss.
3. Verify: Dashboard is immediately interactive. No freeze.

---

### Step 6 — Fix any failures before reporting

If **any** test fails, investigate the root cause, fix it, and re-run the full test suite. Do not report success until all 7 tests pass. If you are uncertain about a design decision, ask the user before implementing.

---

## Constraints

- Do NOT change `BottomSheet.jsx`, `Dashboard.jsx`, `AlbumCard.jsx`, or any other file.
- Do NOT change the component's external API (`album`, `onClose`, `startPhotoId`, `dragProgressMV` props).
- Do NOT remove the vertical swipe-to-dismiss (`dragY`) system — preserve it exactly.
- Do NOT remove the `layoutId` / FLIP animation on photo 0 — preserve it exactly.
- Do NOT add any new npm packages. Use only existing dependencies (React, Framer Motion, TailwindCSS).
- Preserve all existing JSX below the photo carousel: PillBar, BottomSheet, GallerySortSheet, GalleryFilterSheet, StatisticsTab, etc.

---

## Login for Testing

| Field    | Value                |
|----------|----------------------|
| URL      | `http://localhost:5173` |
| Email    | `tester@example.com` |
| Password | `Test1234!A`         |

The dev server is already running (`npm run dev` on port 5173, backend on port 8000).
