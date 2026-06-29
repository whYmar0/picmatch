# AlbumGallery Scroll Optimization — Spec

## Problem Statement

The photo carousel and thumbnail strip in `AlbumGallery.jsx` are **stuttery and laggy** on mobile devices. The snap-to behavior when releasing a swipe is particularly janky. The issue stems from a fundamentally flawed scrolling architecture that fights against the browser's native compositor.

---

## Root Cause Analysis

### 1. Manual `scrollLeft` Manipulation (Primary Bottleneck)

**Current code** (`AlbumGallery.jsx` lines ~548–558):
```js
// Horizontal gesture: manually drive scrollLeft for 1:1 tracking (no momentum)
if (gestureAxis.current === "x") {
  e.preventDefault();
  const el = carouselRef.current;
  if (el) {
    el.scrollLeft = carouselStartScrollLeft.current - dx;
  }
}
```

- `e.preventDefault()` **blocks the browser's compositor-driven scrolling entirely**
- Every pixel of movement goes through: **touch event → JS → DOM `scrollLeft` write → layout/paint**
- This is the #1 cause of scroll stutter on mobile — the compositor cannot skip frames or batch updates

### 2. No Scroll-Snap CSS Properties

The carousel container (`<div ref={carouselRef}>`) has:
- `overflow: hidden` (not `overflow-x: auto`)
- `touchAction: "none"`
- No `scroll-snap-type`, no `scroll-snap-align`

Despite the v8 comments claiming "CSS scroll-snap carousel," **there is no actual CSS scroll-snap**. The "snap" is done manually in `onTouchEnd` via `goTo(carouselStartIdx.current, true)` which calls `scrollTo({ behavior: "instant" })` — a jarring jump.

### 3. Conditional Image Rendering Causes Layout Shifts

```jsx
{Math.abs(i - currentIdx) <= 1 && photo?.url ? (
  <img ... />
) : !photo?.url ? (
  <div>No photo</div>
) : null}
```

When `currentIdx` changes during scroll, images mount/unmount, causing the flex container's layout to shift mid-scroll.

### 4. State Updates During Scroll

`setCurrentIdx` is called during scroll (via the thumbnail strip's scroll listener), triggering a full re-render of the entire AlbumGallery component tree — including PillBar, BottomSheet wrappers, statistics, etc.

### 5. Thumbnail Strip O(n) Scroll Listener

```js
const onScroll = () => {
  if (selectingRef.current) return;
  const mid = strip.scrollLeft + strip.clientWidth / 2;
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < photos.length; i++) {
    const el = thumbRefs.current[i];
    // ... offset calculations
  }
};
```

Iterates ALL thumbnails on every scroll frame. For 200+ photos, this is expensive.

---

## Solution Architecture

### Approach: Native Scroll-Snap + JS Vertical Dismiss (Hybrid)

**Key insight:** Horizontal scroll and vertical dismiss gestures can be separated using `touch-action` CSS, allowing the browser to handle horizontal scroll natively (compositor-driven, zero JS per frame) while JS handles vertical gestures.

---

### A. Carousel — Native Scroll-Snap

**CSS changes on the carousel container:**
```css
.carousel {
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: auto;          /* NOT smooth — we want instant snapping */
  overscroll-behavior-x: contain; /* prevent parent scroll when at edges */
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;            /* CRITICAL: let browser handle horizontal, block vertical */
  scrollbar-width: none;
}
```

**CSS on each slide:**
```css
.slide {
  width: 100vw;
  flex-shrink: 0;
  scroll-snap-align: center;
  content-visibility: auto;       /* skip rendering off-screen slides */
  contain-intrinsic-size: 100vw 100vh;
}
```

**What this eliminates:**
- All manual `scrollLeft` manipulation
- `e.preventDefault()` on horizontal gestures
- Manual snap-to logic in `onTouchEnd`
- The janky `goTo()` instant jump

**What the browser handles natively (zero JS per frame):**
- 1:1 finger tracking
- Momentum/inertia after release
- Snap-to nearest slide
- Rubber-band overscroll at edges

### B. Vertical Dismiss Gesture — JS Touch Handlers on Wrapper

Since `touch-action: pan-x` blocks vertical touch actions on the carousel, vertical gestures bubble up to a **parent wrapper div** where JS can intercept them.

**Architecture:**
```
<motion.div  ← wrapper: handles vertical dismiss (touchAction: "auto")
  style={{ scale, translateY }}
>
  <div        ← carousel: handles horizontal scroll natively (touchAction: "pan-x")
    ref={carouselRef}
    className="carousel"
  >
    {slides}
  </div>
</motion.div>
```

**Touch handler logic on the wrapper:**
```js
onTouchStart → record start position
onTouchMove →
  if axis not determined yet (after 12px):
    if dx > dy → set axis = "x" → do NOTHING (let native scroll handle it)
    if dy > dx → set axis = "y" → e.preventDefault() + dragY.set(dy)
  if axis === "y":
    e.preventDefault() + dragY.set(dy)
onTouchEnd →
  if axis === "y" && dragY > 100 → onClose()
  if axis === "y" → animate(dragY, 0, spring)
  if axis === "x" → do NOTHING (browser already snapped)
```

### C. Tracking the Active Slide — IntersectionObserver

Replace the imperative scroll-based tracking with a declarative `IntersectionObserver`:

```js
useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          const idx = Number(entry.target.dataset.index);
          setCurrentIdx(idx);
          break;
        }
      }
    },
    { root: carouselRef.current, threshold: 0.5 }
  );

  const slides = carouselRef.current?.querySelectorAll('.slide');
  slides?.forEach((el) => observer.observe(el));

  return () => observer.disconnect();
}, [photos.length]);
```

**Benefits:**
- Zero JS per frame during scroll
- Only fires when a slide crosses the 50% visibility threshold
- Compositor-driven accuracy

### D. Image Rendering Strategy

**All slide wrapper divs always mounted** (prevents layout shift):
```jsx
{photos.map((photo, i) => (
  <div
    key={photo.id}
    className="slide"
    data-index={i}
  >
    {/* Only render <img> for nearby slides */}
    {Math.abs(i - currentIdx) <= 2 && photo?.url ? (
      <img src={photo.url} ... />
    ) : (
      <div className="placeholder" />  /* same size as img, prevents shift */
    )}
  </div>
))}
```

The `<div className="placeholder">` ensures the slide always has the correct dimensions even when the image isn't loaded, preventing layout shifts.

`content-visibility: auto` on `.slide` handles the performance for 200+ photo albums — the browser skips rendering work for off-screen slides entirely.

### E. Programmatic Navigation (Thumbnail Tap, Keyboard)

When the user taps a distant thumbnail or presses an arrow key:

```js
const goTo = useCallback((idx) => {
  const el = carouselRef.current;
  if (!el) return;
  const slide = el.querySelector(`[data-index="${idx}"]`);
  if (slide) {
    slide.scrollIntoView({ behavior: 'instant', inline: 'center' });
  }
}, []);
```

Uses `scrollIntoView` with `behavior: 'instant'` for thumbnail taps (user requirement: instant snap, not smooth scroll through intermediates).

### F. Thumbnail Strip — Optimized Scroll

**Replace O(n) scroll listener with O(1) calculation:**
```js
const onScroll = () => {
  if (selectingRef.current) return;
  const idx = Math.round(strip.scrollLeft / (THUMB_SIZE + THUMB_GAP));
  const clamped = Math.max(0, Math.min(idx, photos.length - 1));
  if (clamped !== lastIdx.current) {
    lastIdx.current = clamped;
    onSelect(clamped);
  }
};
```

**CSS scroll-snap on thumbnail strip:**
```css
.thumb-strip {
  overflow-x: auto;
  scroll-snap-type: x proximity;   /* proximity, not mandatory — less aggressive */
  touch-action: pan-x;
  scrollbar-width: none;
}
.thumb-item {
  scroll-snap-align: center;
  flex-shrink: 0;
}
```

**Feedback loop prevention:**
- When carousel drives thumbnails: `selectingRef.current = true` during programmatic thumbnail scroll, cleared after 100ms
- When thumbnails drive carousel: set `isCarouselProgrammatic = true` during `scrollIntoView`, cleared via IntersectionObserver callback
- Debounce thumbnail-driven carousel jumps (50ms) to prevent rapid-fire during fast thumbnail scrolling

### G. Component Memoization

To prevent unnecessary re-renders when `currentIdx` changes:

```jsx
const MemoizedThumbStrip = React.memo(ThumbStrip);
const MemoizedPillBar = React.memo(PillBar);
```

Pass only the minimal props each component needs. This ensures that when `setCurrentIdx` fires from the IntersectionObserver, only the components that actually depend on `currentIdx` re-render.

### H. BottomSheet Interaction Lock

When `sheetExpanded` is true:
- Add `pointer-events: none` to the carousel wrapper
- The carousel remains visible but cannot be interacted with
- The BottomSheet handles all touch interaction

This is already partially implemented via `controlsPointerEvents` but needs to be applied to the carousel wrapper as well.

---

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/components/AlbumGallery.jsx` | Complete rewrite of carousel touch handling, scroll-snap CSS, IntersectionObserver, ThumbStrip optimization, memoization |
| `frontend/src/components/BottomSheet.jsx` | No changes needed (already supports sharedY and pointer-events) |
| `frontend/src/components/ImageLightbox.jsx` | No changes (separate component, not involved) |

---

## Behavior Spec

### Main Carousel (Horizontal)
| Behavior | Implementation |
|----------|---------------|
| 1:1 finger tracking during swipe | Native browser scroll (compositor-driven) |
| Snap to nearest photo on release | `scroll-snap-type: x mandatory` |
| Rubber-band at edges | Native browser overscroll |
| Instant snap when tapping distant thumbnail | `scrollIntoView({ behavior: 'instant' })` |
| Keyboard left/right navigation | `scrollIntoView({ behavior: 'instant' })` |
| Gallery locked when BottomSheet open | `pointer-events: none` on carousel |
| Preload adjacent images | Render `<img>` for `currentIdx ± 2` |

### Vertical Dismiss
| Behavior | Implementation |
|----------|---------------|
| Axis-locked (first 12px determines direction) | JS touch handlers on wrapper |
| Photo follows finger 1:1 vertically | `dragY.set(dy)` on Framer Motion value |
| Threshold: >100px to dismiss | `onClose()` in `onTouchEnd` |
| Spring-back if below threshold | `animate(dragY, 0, spring)` |

### Thumbnail Strip
| Behavior | Implementation |
|----------|---------------|
| Scroll follows finger smoothly | Native browser scroll with `scroll-snap-type: x proximity` |
| Instantly switches active photo on scroll | O(1) index calculation from `scrollLeft` |
| Auto-scrolls to follow carousel | `scrollIntoView({ behavior: 'instant' })` on `currentIdx` change |
| No feedback loops | `selectingRef` guard + programmatic scroll flag |

### Sync Behavior
| Trigger | Action |
|---------|--------|
| Carousel lands on new photo | Thumbnail strip scrolls to center that thumb |
| User scrolls thumbnail strip | Carousel snaps to that photo |
| User taps thumbnail | Carousel instantly jumps to that photo |
| Keyboard arrow key | Carousel instantly jumps, thumb follows |

---

## Non-Goals

- ❌ No new animations or visual transitions
- ❌ No skeleton loaders or placeholder shimmer effects
- ❌ No changes to the BottomSheet behavior
- ❌ No changes to the photo scale/translateY when sheet opens (keep existing motion values)
- ❌ No changes to ImageLightbox.jsx
- ❌ No changes to VotePage.jsx or SwipeCard.jsx

---

## Performance Targets

| Metric | Current (estimated) | Target |
|--------|---------------------|--------|
| Frames per swipe gesture | ~30-45 fps (JS bottleneck) | 60 fps (native compositor) |
| JS calls per scroll frame | 2-3 (scrollLeft write + state update) | 0 (native scroll) |
| Re-renders per slide change | Full tree re-render | ~2-3 memoized components |
| Thumbnail scroll iteration | O(n) per frame | O(1) per frame |
| Layout shifts during scroll | Yes (image mount/unmount) | None (fixed-size slide wrappers) |
