# Animation Improvement & Smooth Dismiss Specification — AlbumGallery Photo Viewer

## Goal

Overhaul and refine the swipe-down-to-dismiss gesture and exit animation in `AlbumGallery.jsx` and `Dashboard.jsx`. Eliminate the jump in background page scale when the finger releases, resolve image flickering/stuttering during dismissal, and achieve a butter-smooth, continuous transition from finger touch release to the final resting state.

---

## Identified Defects & Root Causes

### 1. Page Scale Jump on Release
- **Symptom:** As the user drags the photo down, the background `Dashboard` page smoothly un-zooms (scale interpolates from 0.94 towards 1.0). But the instant the user releases their finger to complete the dismissal, the scale suddenly jumps to a different value before animating, causing a jarring visual flicker.
- **Root Cause:**
  1. In `AlbumGallery.jsx` (`onWrapperTouchMove`), `dragProgressMV` is updated during drag: `dragProgressMV.set(Math.max(0, Math.min(1, newDragY / (vh * 0.5))))`.
  2. When `currentDrag > 100`, `onClose()` is called immediately on touch end.
  3. `onClose()` triggers `handleGalleryClose` in `Dashboard.jsx`, which synchronously executes `dragProgressMV.set(1)`.
  4. Setting `dragProgressMV.set(1)` immediately snaps `pageScaleMV` to `1.0` in a single frame, regardless of whether the finger was at `dragProgressMV = 0.3` or `0.6` at the moment of release.
  5. Simultaneously, `Dashboard.jsx`'s `useEffect` triggers `animate(baseScaleMV, galleryAlbum ? 0.94 : 1, { duration: 0.36 })`. Because `baseScaleMV` starts animating from `0.94` to `1` while `dragProgressMV` was instantly snapped to `1`, the mathematical formula `base + (1 - base) * drag` produces a discontinuous jump.

### 2. Image Stuttering & Flickering During Dismiss
- **Symptom:** During the 220ms exit phase, the photo image appears to blink, disappear for a frame, or stutter as it transitions back to the album card position.
- **Root Cause:**
  1. `setIsExiting(true)` causes re-renders during the exit phase.
  2. `AnimatePresence` handles unmounting while Framer Motion's `layoutId` attempts a FLIP projection. If the photo `motion.img` element's `style`, `layoutId`, or parent transform values change on release (e.g. `combinedScale` or `combinedTranslateY` resetting or unmounting out of order), Framer Motion recalculates the bounding box mid-flight.
  3. `bgOpacity` is derived from `dragY`. When `onClose()` is called, if `dragY` is not animated smoothly to `vh` or if `opacity` is driven by both outer `AnimatePresence` and inner `bgOpacity`, the black backdrop jumps in opacity before fading out.

---

## Required Behavior & Architecture

### A. Continuous Page Scale Interpolation
1. **Never snap `dragProgressMV` to 1.0 on release.**
2. When the user releases a dismiss swipe (`currentDrag > 100`):
   - Capture the current progress value: `const currentProgress = dragProgressMV.get()`.
   - Animate `dragProgressMV` from `currentProgress` to `1.0` using a spring/ease that matches the photo exit spring: `animate(dragProgressMV, 1, { type: "spring", stiffness: 350, damping: 32 })`.
   - `handleGalleryClose` must not force an instantaneous `.set(1)`. It should allow the smooth spring animation of `dragProgressMV` to complete.
3. When the gallery unmounts completely, reset `dragProgressMV` to `0` cleanly.

### B. Smooth Image FLIP & Exit Continuity
1. **Preserve exact bounding box on release:** The `motion.img` element must maintain continuous transform state from the drag position to the target card rect.
2. During exit, `dragY` should continue animating smoothly downwards to `vh` (or hand off cleanly to the FLIP layout animation without interrupting `combinedScale` / `combinedTranslateY`).
3. Ensure no React re-render unmounts or toggles `layoutId` mid-exit. `isExitingRef.current` must prevent secondary spring updates or index changes from firing during the exit window.
4. Smooth Backdrop Fade: `bgOpacity` must decay smoothly from its release-time value to `0` without snapping to black or 0 instantly.

---

## Step-by-Step Implementation Instructions

### Files to Modify

| File | Changes Required |
|---|---|
| `frontend/src/components/AlbumGallery.jsx` | Animate `dragY` / `dragProgressMV` smoothly to target exit values; eliminate transform jumps; ensure exit continuity for `layoutId`. |
| `frontend/src/pages/Dashboard.jsx` | Update `handleGalleryClose` to avoid instant `.set(1)` jumps and ensure `pageScaleMV` animates smoothly from current progress to 1.0. |

---

## Step-by-Step Guidance for Agent

### Step 1 — Audit Motion Values & Dismiss Branch
Read `AlbumGallery.jsx` lines 460–500 (motion values) and lines 744–790 (`onWrapperTouchEnd`).
Read `Dashboard.jsx` lines 105–162 (`dragProgressMV`, `pageScaleMV`, `handleGalleryClose`).

### Step 2 — Fix Page Scale Jump in `Dashboard.jsx` & `AlbumGallery.jsx`

In `Dashboard.jsx`:
```javascript
const handleGalleryClose = useCallback(() => {
  // Smoothly animate dragProgressMV from its current value to 1 instead of snapping instantly
  const currentProgress = dragProgressMV.get();
  animate(dragProgressMV, 1, {
    type: "spring",
    stiffness: 350,
    damping: 32,
    onComplete: () => {
      dragProgressMV.set(0);
    }
  });
  setGalleryAlbum(null);
}, [dragProgressMV]);
```

In `AlbumGallery.jsx` (`onWrapperTouchEnd` dismiss branch):
```javascript
if (currentDrag > 100) {
  isExitingRef.current = true;
  snapAnimRef.current?.stop();
  
  // Animate dragY smoothly to vh to complete the downward fall
  dragYAnimRef.current = animate(dragY, vh, {
    type: "spring",
    stiffness: 350,
    damping: 32
  });

  setSheetExpanded(false);
  setSortOpen(false);
  setFilterOpen(false);
  setShareSheetOpen(false);
  setIsExiting(true);
  galleryRef.current?.setAttribute("inert", "");
  onClose();
  gestureAxis.current = null;
  return;
}
```

### Step 3 — Eliminate Image Stutter & Backdrop Jump

1. Ensure `combinedScale` and `combinedTranslateY` remain valid during `isExiting`.
2. Do not reset `dragY` or `photoScale` prematurely during `onClose()`.
3. Verify `layoutId` on `motion.img` is preserved during exit when `currentIdx === 0` (or for active photo FLIP).
4. Verify backdrop `bgOpacity` decays smoothly from current opacity to `0` over the exit duration.

---

## Verification & Self-Test Protocol

The AI agent must run Playwright automated tests on `http://localhost:5173` using the credentials:
- **Email:** `tester@example.com`
- **Password:** `Test1234!A`

### Tests to Execute:

1. **Partial Drag Release (Snap-back):**
   - Open gallery, drag photo down by 40px (less than threshold), release finger.
   - **Verification:** Photo springs back to center smoothly; background page scale returns to `0.94` with zero jumps or visual glitches.

2. **Full Dismiss Drag Release (Close):**
   - Open gallery, drag photo down by 150px, release finger.
   - **Verification:** Background page scale starts animating **exactly** from the scale it had at release time to `1.0`. No jump or flash occurs at the moment of finger release.

3. **Fast Flick Dismiss:**
   - Open gallery, flick photo down rapidly.
   - **Verification:** Dismissal completes with high frame rate (60fps), backdrop fades out smoothly, image transitions cleanly into album card.

4. **Dismiss from Non-Zero Index:**
   - Swipe to photo 2 or 3, drag down to dismiss.
   - **Verification:** Gallery closes smoothly with opacity/scale exit; Dashboard becomes 100% interactive immediately; no image blinks or freezes.

---

## Constraints

- Do NOT remove `AnimatePresence` or `layoutId` shared element transitions.
- Do NOT alter any backend APIs, auth, or unrelated page logic.
- Maintain existing props for `AlbumGallery`.
- Use only existing project dependencies (React 18, Framer Motion, TailwindCSS).
