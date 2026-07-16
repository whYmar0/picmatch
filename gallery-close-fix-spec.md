# PicMatch v5 — Gallery Close Animation Bug Fix Spec

**Date:** July 13, 2026
**Status:** Approved — ready for implementation

---

## Overview

Fix two issues in the gallery close animation. Only **one file** is modified:
`frontend/src/components/AlbumGallery.jsx`.

No other files need changes.

**Stack:** React 18, Framer Motion (`motion`, `animate`, `useMotionValue`, `useTransform`), TailwindCSS.

---

## Bug 1 — Ghost photo flies in from the side + jerky / frozen animation on close from non-first photo

### Symptom

When the user is viewing **any photo other than index 0** and swipes down to close the gallery:

- During the 220 ms exit fade, **photo 0 visibly slides in from the left side** of the screen and then disappears.
- The closing animation is **jerky** — the photo track shifts abruptly mid-fade.
- **Occasionally** the underlying `Dashboard` page remains frozen / unresponsive after close.

### Root Cause Analysis

Three independent defects combine to produce this bug.

#### Defect A — `layoutId` is unconditional on photo 0 (primary cause of flying photo)

In the carousel photo render:

```jsx
layoutId={i === 0 ? `album-cover-${album.id}` : undefined}
```

This assigns `layoutId="album-cover-<id>"` to photo 0's `motion.img` **regardless of what index is currently displayed**. Framer Motion's Shared Layout system continuously tracks any element that carries a `layoutId`. When the gallery is open at `currentIdx = N > 0`, photo 0 is still rendered in the DOM (because `Math.abs(0 - N) <= 2` is true for N = 1 or 2). Its `motion.img` is being tracked under `album-cover-<id>` even though it is off-screen at position `-N × containerWidth` inside the carousel track.

The AlbumCard on `Dashboard.jsx` **always** has a `motion.img` with `layoutId="album-cover-<id>"`. While the gallery is open, this album card is underneath the gallery overlay. When the gallery starts its exit (`AnimatePresence` keeps it alive for 220 ms), Framer Motion detects that the AlbumCard's `layoutId` element is re-entering the layout tree. It performs a FLIP animation from the element with the matching `layoutId` in the gallery — which is photo 0, currently off-screen — to the AlbumCard's position. This causes **photo 0 to animate (fly) across the screen** from the left side to the album card rect.

#### Defect B — `snapAnimRef` is not stopped in the dismiss branch (primary cause of jerk)

When the user swipes down to dismiss, the carousel `snapAnimRef` animation may still be active. `onWrapperTouchStart` calls `snapAnimRef.current?.stop()` for new gestures, but a timing window exists: if the swipe-down gesture begins **after** the X-snap spring has visually completed but **before** its `onComplete` callback fires, the callback runs during the 220 ms exit window:

```js
onComplete: () => {
  setCurrentIdx(targetIdx);         // ← React state update during exit
  currentIdxRef.current = targetIdx;
  dragX.set(0);                     // ← dragX changes → carouselX recalculates → track jumps
},
```

If `targetIdx === 0`, this also makes `layoutId` active on photo 0 (Defect A path). Even when `targetIdx !== 0`, `dragX.set(0)` causes `carouselX` to recalculate, producing a visible **jump in the carousel track** during the exit fade.

#### Defect C — Page freeze (secondary, partially mitigated)

The root `motion.div` already has `exit={{ ..., pointerEvents: "none" }}`, so the 220 ms exit fade no longer blocks pointer events. However, if Defect B fires (`setCurrentIdx` during exit), React may schedule a synchronous re-render that re-activates `layoutId` on photo 0 and triggers a Framer Motion FLIP beyond the 220 ms window, causing an effective freeze.

### Fix

**File:** `frontend/src/components/AlbumGallery.jsx`

#### Change 1 — Make `layoutId` conditional on `currentIdx === 0`

Only `layoutId` is gated. `initial`, `animate`, and `transition` remain `i === 0` (always-on for photo 0) to avoid visual snapping when swiping back to the first photo.

```
BEFORE (line ~948):
layoutId={i === 0 ? `album-cover-${album.id}` : undefined}
initial={i === 0 ? { borderRadius: 16 } : undefined}
animate={i === 0 ? { borderRadius: 0 } : undefined}
transition={i === 0 ? { type: "spring", stiffness: 280, damping: 32, mass: 0.95 } : undefined}

AFTER:
layoutId={i === 0 && currentIdx === 0 ? `album-cover-${album.id}` : undefined}
initial={i === 0 ? { borderRadius: 16 } : undefined}
animate={i === 0 ? { borderRadius: 0 } : undefined}
transition={i === 0 ? { type: "spring", stiffness: 280, damping: 32, mass: 0.95 } : undefined}
```

**Why only layoutId?** `initial` only fires on first mount — gating it doesn't help and could cause borderRadius snapping when swiping back to photo 0. `animate` is always `{ borderRadius: 0 }` → no ongoing animation, no interference. Only `layoutId` connects to the Shared Element Transition and must be gated.

> **⚠️ Known risk:** Making `layoutId` become `undefined` on a still-mounted `motion.img` can cause Framer Motion's global layoutId cache to leak a stale position. This exact pattern previously caused the "cover disappears, albums stop opening" bug. **Mitigation:** The `galleryKey` mechanism in `Dashboard.jsx` (already present, kept for defense-in-depth) forces a fresh component mount → fresh DOM → FM creates new layoutId registrations. Combined with `snapAnimRef.stop()` (Change 2), the odds of cache corruption are reduced.

#### Change 2 — Stop `snapAnimRef` before calling `onClose()` in the dismiss branch

BEFORE:
```js
if (currentDrag > 100) {
  dragYAnimRef.current?.stop();
  setSheetExpanded(false);
  onClose();
  gestureAxis.current = null;
  return;
}
```

AFTER:
```js
if (currentDrag > 100) {
  snapAnimRef.current?.stop();     // ← ADD: stop any in-flight carousel snap
  dragYAnimRef.current?.stop();
  setSheetExpanded(false);
  onClose();
  gestureAxis.current = null;
  return;
}
```

`snapAnimRef.stop()` runs **before** `dragYAnimRef.stop()`. Order is not critical (both are synchronous), but placing it first documents the intent: prevent the X-snap from firing during exit.

---

## Bug 2 — PillBar icons change color based on count

### Symptom

In the photo viewer's bottom pill bar, the `FilledHeart`, `BrokenHeart`, and `MessageCircle` icons are dimmed (`text-white/40`) when their count is 0, and bright white when the count is > 0. The user wants all three icons always white.

### Root Cause

`PillBar` component applies a conditional `className`:

```jsx
<FilledHeart size={22} className={likeCount > 0 ? "text-white" : "text-white/40"} />
<BrokenHeart size={22} className={dislikeCount > 0 ? "text-white" : "text-white/40"} />
<MessageCircle size={20} strokeWidth={1.75} className={commentCount > 0 ? "text-white" : "text-white/40"} />
```

### Fix

**File:** `frontend/src/components/AlbumGallery.jsx` — `PillBar` component.

Replace each conditional `className` with unconditional `"text-white"`. The wrapper `<span>` elements (22×22) and `MessageCircle` size (20, strokeWidth 1.75) from the previous Bug 3 fix are already correct — do **not** change them.

```
BEFORE:
<FilledHeart size={22} className={likeCount > 0 ? "text-white" : "text-white/40"} />

AFTER:
<FilledHeart size={22} className="text-white" />
```

Same for `BrokenHeart` and `MessageCircle`:

```
BEFORE:
<BrokenHeart size={22} className={dislikeCount > 0 ? "text-white" : "text-white/40"} />

AFTER:
<BrokenHeart size={22} className="text-white" />
```

```
BEFORE:
<MessageCircle size={20} strokeWidth={1.75} className={commentCount > 0 ? "text-white" : "text-white/40"} />

AFTER:
<MessageCircle size={20} strokeWidth={1.75} className="text-white" />
```

---

## Files to Modify

| File | Changes |
|---|---|
| `frontend/src/components/AlbumGallery.jsx` | Bug 1 (2 changes) + Bug 2 (1 change) = 3 total edits |

**Do NOT change any other files.** The `galleryKey` mechanism already present in `Dashboard.jsx` is kept as-is for defense-in-depth.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| Only `layoutId` conditional, not `initial`/`animate`/`transition` | `initial` only fires on mount → gating it serves no purpose. `animate` is static (`{ borderRadius: 0 }`) → no animation during carousel swipe. Less change = less risk. |
| `snapAnimRef.stop()` before `dragYAnimRef.stop()` | Both synchronous — order doesn't matter. First position documents intent: prevent X-snap from running during exit. |
| Keep `galleryKey` in `Dashboard.jsx` | Fresh component mount guarantees clean `useMotionValue(0)`. Not in the original spec, but the spec was written before galleryKey existed. Removing it would be a regression risk. |
| No FLIP when closing from non-first photo | Accepted tradeoff. The exit is a clean opacity fade with no flying photo artifact. FLIP only works when closing from photo 0. |
| Only `className` changed for Bug 2 | Wrapper spans and icon sizes from Bug 3 are already correct. |

---

## Verification Checklist

### Bug 1 — Close animation from non-first photo

- [ ] Open a gallery that has 3 or more photos.
- [ ] Swipe to photo at index 1 or 2 (second or third photo).
- [ ] Swipe down to dismiss.
- [ ] Confirm: **no photo 0 flies in from the left** during the exit fade.
- [ ] Confirm: the exit animation is a clean, smooth opacity fade — no sudden track jumps.
- [ ] Confirm: the `Dashboard` page is fully interactive immediately after the gallery closes.
- [ ] Repeat with a very fast horizontal swipe followed immediately by a downward dismiss swipe (stress-test for Defect B timing).
- [ ] Open gallery from photo 0 (index 0) and close — confirm the FLIP animation to the album card still works correctly (regression check for Change 1).
- [ ] Open gallery to a non-first photo, close, then reopen the same album to photo 0 — confirm the album cover on the Dashboard is still visible and functional (regression check for layoutId cache leak).
- [ ] After closing from a non-first photo, verify that other albums can still be opened (regression check for layoutId cache corruption).

### Bug 2 — PillBar icon color

- [ ] Open any album gallery.
- [ ] Confirm all three icons (heart, broken heart, message) are the same white color.
- [ ] Verify an album where like count = 0 or comment count = 0: icons are still fully white, not dimmed.
- [ ] Verify an album with non-zero counts: icons remain the same white (no change from zero state).
