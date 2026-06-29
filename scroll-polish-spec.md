# AlbumGallery Scroll Polish — v9.1 Spec

## Problem Statement

After the v9 scroll-snap rewrite, two distinct issues remain:

1. **Carousel overshoots on fast swipe** — `scroll-snap-type: x mandatory` allows the browser's momentum to coast through multiple slides. Fast flicks land 2-3 photos away instead of exactly 1.
2. **Thumbnail strip drags laggy** — `scroll-snap-type: x proximity` adds snap resistance during manual dragging, making it feel sluggish. The strip also jumps instead of animating when following the carousel.

---

## Root Cause Analysis

### Issue 1: Carousel overshoot

With `scroll-snap-type: x mandatory`, the browser's scroll physics decide how far momentum carries. On a fast flick, the browser may skip over 2-3 snap points before settling. There is no CSS property currently set to prevent this.

**Fix:** Add `scroll-snap-stop: always` to each slide. This CSS property tells the browser: "during momentum scroll, stop at THIS snap point — do not skip past it." A fast flick will land on exactly the next slide, never overshooting. This is a pure CSS fix, zero JS overhead.

### Issue 2: Thumbnail strip lag

Two causes:

**a) `scroll-snap-type: x proximity` adds friction** — the browser applies snap resistance during drag, making the strip feel like it fights the finger. Removing snap entirely gives pure free-scroll.

**b) O(1) scroll listener calls `onSelect` on every frame** — during fast drag, the scroll listener fires at 60fps and calls `setCurrentIdx` for each intermediate index, causing React re-renders on every frame.

**Fix:**
- Remove `scroll-snap-type` from the thumbnail strip entirely — pure free-scroll.
- Debounce the scroll listener's `onSelect` call with `requestAnimationFrame` so it fires at most once per frame, and only when the index actually changes.

### Issue 3: Thumbnail strip should animate smoothly when following carousel

Currently `centerThumb` uses `behavior: "instant"` which makes the strip jump. When the carousel snaps to a new photo, the strip should smoothly animate to center the new thumbnail.

**Fix:** Change `centerThumb` to use `behavior: "smooth"`. Adjust the `selectingRef` timeout to accommodate the smooth animation duration (~200ms).

---

## Changes

### File: `frontend/src/components/AlbumGallery.jsx`

#### A. Carousel — add `scroll-snap-stop: always` (line ~470)

On each slide's style:
```jsx
style={{
  scrollSnapAlign: "center",
  scrollSnapStop: "always",   // ← ADD: force stop at every slide
  contentVisibility: "auto",
  containIntrinsicSize: "auto 100%",
}}
```

**Why this works:** `scroll-snap-stop: always` is supported in all modern mobile browsers (Chrome 75+, Safari 16.4+, Firefox 103+). It prevents the browser from "flying past" a snap point during momentum scroll. Each swipe — no matter how fast — lands on exactly 1 slide.

#### B. ThumbStrip — remove scroll-snap, use rAF debouncing

**Remove** `scrollSnapType` from the strip:
```jsx
// BEFORE:
style={{
  scrollSnapType: "x proximity",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
}}

// AFTER:
style={{
  scrollbarWidth: "none",
  msOverflowStyle: "none",
}}
```

**Remove** `scrollSnapAlign: "center"` from each thumb button:
```jsx
// BEFORE:
style={{
  width: THUMB_SIZE,
  height: THUMB_SIZE,
  flexShrink: 0,
  scrollSnapAlign: "center",
}}

// AFTER:
style={{
  width: THUMB_SIZE,
  height: THUMB_SIZE,
  flexShrink: 0,
}}
```

**Debounce scroll listener** with rAF:
```js
// BEFORE:
const onScroll = () => {
  if (selectingRef.current) return;
  const idx = Math.round(strip.scrollLeft / (THUMB_SIZE + THUMB_GAP));
  const clamped = Math.max(0, Math.min(idx, photos.length - 1));
  if (clamped !== lastIdx.current) {
    lastIdx.current = clamped;
    onSelect(clamped);
  }
};
strip.addEventListener("scroll", onScroll, { passive: true });

// AFTER:
let rafId = null;
const onScroll = () => {
  if (selectingRef.current) return;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    const idx = Math.round(strip.scrollLeft / (THUMB_SIZE + THUMB_GAP));
    const clamped = Math.max(0, Math.min(idx, photos.length - 1));
    if (clamped !== lastIdx.current) {
      lastIdx.current = clamped;
      onSelect(clamped);
    }
  });
};
strip.addEventListener("scroll", onScroll, { passive: true });
// cleanup: cancelAnimationFrame(rafId)
```

#### C. ThumbStrip — smooth animation when following carousel

Change `centerThumb` behavior from `"instant"` to `"smooth"`:
```js
// BEFORE:
strip.scrollTo({ left: Math.max(0, Math.min(target, max)), behavior: "instant" });

// AFTER:
strip.scrollTo({ left: Math.max(0, Math.min(target, max)), behavior: "smooth" });
```

Increase `selectingRef` timeout from 150ms to 300ms to cover the smooth scroll animation:
```js
selectTimer.current = setTimeout(() => { selectingRef.current = false; }, 300);
```

Also increase the timeout in `onClick` to match:
```js
onClick={() => {
  selectingRef.current = true;
  clearTimeout(selectTimer.current);
  onSelect(i);
  selectTimer.current = setTimeout(() => { selectingRef.current = false; }, 300);
}}
```

---

## Summary of All Changes

| Change | Type | Impact |
|--------|------|--------|
| Add `scroll-snap-stop: always` to carousel slides | CSS (1 line) | Prevents overshoot on fast swipe |
| Remove `scrollSnapType` from thumbnail strip | CSS (remove) | Removes snap friction during drag |
| Remove `scrollSnapAlign` from thumb buttons | CSS (remove) | Removes snap friction during drag |
| Add rAF debounce to thumb scroll listener | JS (small) | Prevents frame-dropping re-renders |
| Change `centerThumb` to `behavior: "smooth"` | JS (1 word) | Smooth animation when following carousel |
| Increase `selectingRef` timeout to 300ms | JS (2 numbers) | Covers smooth scroll duration |

---

## Non-Goals

- No changes to the carousel touch handlers or vertical dismiss gesture
- No changes to the IntersectionObserver
- No changes to BottomSheet, PillBar, or any other component
- No new animations or visual transitions beyond the smooth thumb scroll

---

## Performance Targets

| Metric | v9 (current) | v9.1 (target) |
|--------|-------------|---------------|
| Slides per fast swipe | 1-4 (unpredictable) | Always 1 |
| Thumb strip drag feel | Snap resistance, laggy | Pure free-scroll, buttery |
| Thumb follow animation | Instant jump | Smooth 200ms ease-out |
| JS re-renders during fast thumb drag | 60/sec (every frame) | ~1/sec (rAF debounced) |
