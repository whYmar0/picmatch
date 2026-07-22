# Critical Bug: Page Freeze After Closing Gallery on Non-First Photo

## Your Mission

You are tasked with finding and permanently fixing a **critical UI freeze bug** in this project.

**Reproduce the bug:**
1. Open the Dashboard (`/dashboard`).
2. Click any album that has 2 or more photos — the `AlbumGallery` overlay opens.
3. Swipe horizontally to any photo **other than the first one** (index ≥ 1).
4. Swipe **down** to dismiss/close the gallery.
5. **Expected:** Gallery closes, Dashboard is fully interactive.
6. **Actual:** Gallery closes but the Dashboard page is **completely frozen** — no taps, no scrolls, no buttons respond. The page only recovers after a hard refresh.

**Success criterion:** After your fix, the Dashboard must be fully interactive immediately after closing a gallery at **any** photo index (0, 1, 2, … N-1), regardless of whether the BottomSheet was open, regardless of whether a carousel snap was in flight. Test every edge case yourself.

---

## Stack

- **Frontend:** React 18 + Vite
- **Animation:** Framer Motion (`motion`, `animate`, `useMotionValue`, `useTransform`, `AnimatePresence`)
- **UI:** TailwindCSS utility classes
- **No backend changes needed** — this is a pure frontend/browser rendering bug.

---

## Approach Required

### Step 1 — Read the code in full before touching anything

Read these files completely before writing a single line of code:

| File | Why |
|---|---|
| `frontend/src/components/AlbumGallery.jsx` | Main gallery component — all touch logic, body lock, motion values, carousel animation |
| `frontend/src/components/BottomSheet.jsx` | Module-level `bodyLockHolders` ref-counted lock — **critical** |
| `frontend/src/pages/Dashboard.jsx` | Gallery lifecycle, `galleryAlbum` state, body lock `useEffect` |
| `frontend/src/App.jsx` | Router and layout wrappers |

Pay special attention to:
- **Every place** `document.body.style.overflow` is read or written.
- The module-level `bodyLockHolders` counter in `BottomSheet.jsx` and how it interacts with the gallery's own body-lock `useEffect` in `Dashboard.jsx`.
- The `exit` animation on the root `motion.div` in `AlbumGallery.jsx` — does it still intercept pointer/touch events during the 220 ms fade?
- The `snapAnimRef.current` carousel spring — can its `onComplete` callback fire during the exit window and trigger a React state update that re-activates `layoutId` on photo 0, causing an unintended Framer Motion FLIP?

### Step 2 — Form a hypothesis from the code

Before touching anything, write down the **exact causal chain** that leads to the freeze. For example:

> "When `currentIdx > 0` and the user dismisses, X happens, which causes Y, which leaves Z in state S, which makes the DOM unresponsive because…"

Only proceed to coding once you can articulate the full chain.

### Step 3 — Ask before acting on ambiguity

If you find multiple possible root causes and you are not certain which one is the **actual** cause in the current codebase, **ask the user one clear question** before writing code. Do not apply speculative multi-fix patches. Fix only what you have proven is the cause.

### Step 4 — Apply the minimal correct fix

Write the smallest possible change that addresses the root cause. Do not refactor unrelated code. Do not remove features. Preserve all existing comments and logic that is not related to the bug.

### Step 5 — Test the fix yourself

After applying the fix, use your browser testing tools to verify:

1. Open gallery on photo index 0 → close → Dashboard interactive ✓
2. Open gallery on photo index 1 → close → Dashboard interactive ✓
3. Open gallery on photo index 2+ → close → Dashboard interactive ✓
4. Open gallery → swipe to index 1 → open BottomSheet (Stats tab) → close gallery → Dashboard interactive ✓
5. Open gallery → start a horizontal swipe (trigger carousel snap) → immediately swipe down to dismiss → Dashboard interactive ✓
6. Open gallery → open second sheet (Sort/Filter) → close all and dismiss → Dashboard interactive ✓

If **any** of these scenarios still freeze, your fix is incomplete. Continue investigating.

### Step 6 — Report findings

After the fix is verified, document:
- The exact root cause (file name, line numbers, what was broken).
- What you changed and why.
- Which scenarios you tested and what the results were.

---

## Known Suspects (Do Not Skip These)

Previous investigation has identified several plausible causes. **None have been confirmed as the single root cause** — you must verify independently.

### Suspect A — `bodyLockHolders` counter desync (BottomSheet.jsx)

`BottomSheet.jsx` uses a module-level counter:
```js
let bodyLockHolders = 0;
function lockBody() { bodyLockHolders++; if (bodyLockHolders === 1) document.body.style.overflow = "hidden"; }
function unlockBody() { bodyLockHolders = Math.max(0, bodyLockHolders - 1); if (bodyLockHolders === 0) document.body.style.overflow = ""; }
```

`AlbumGallery` renders multiple `BottomSheet` instances simultaneously (primary sheet, `GallerySortSheet`, `GalleryFilterSheet`, `AnalyticsShareSheet`). If any of these sheets had `open=true` at some point and then closed without proper cleanup — or if the cleanup ran in wrong order during the gallery's exit — `bodyLockHolders` may remain > 0 after the gallery is gone, leaving `overflow: hidden` permanently on the body.

**Also check:** `Dashboard.jsx` now has its own body-lock `useEffect` keyed on `galleryAlbum`. Verify it does NOT conflict with `BottomSheet`'s lock. If both set `overflow: hidden` and only one restores it, the counter will be wrong.

### Suspect B — `exit` animation still captures pointer events (AlbumGallery.jsx)

The root `motion.div` wrapper at line ~895 has:
```jsx
exit={{ opacity: 0, pointerEvents: "none", transition: { duration: 0.22 } }}
```

Verify that `pointerEvents: "none"` in Framer Motion's `exit` object is **actually applied** during the exit animation and not only at the end. In some versions of Framer Motion, style overrides in `exit` only take effect once the exit animation *starts*, not instantly. Check whether there is a window where the wrapper still intercepts events.

**Also check:** `style={{ touchAction: "none" }}` is on the wrapper. Does this persist during exit even after `pointerEvents: "none"` is applied?

### Suspect C — `snapAnimRef.onComplete` fires during the exit window (AlbumGallery.jsx)

The carousel snap animation (`snapAnimRef`) at line ~732:
```js
snapAnimRef.current = animate(dragX, ..., {
  onComplete: () => {
    if (isDismissingRef.current) return;   // guard
    setCurrentIdx(targetIdx);
    currentIdxRef.current = targetIdx;
    dragX.set(0);
  },
});
```

The `isDismissingRef` guard is set in the dismiss branch of `onWrapperTouchEnd`. Verify that:
1. `isDismissingRef` is initialized correctly and is reset properly between gallery opens (it must be `false` on each new gallery mount).
2. The `snapAnimRef.current?.stop()` call in the dismiss branch actually stops the animation **before** `onComplete` can fire.
3. There is no race between `stop()` and `onComplete` in Framer Motion's scheduler.

### Suspect D — `layoutId` on photo 0 triggers FLIP during exit (AlbumGallery.jsx)

At line ~985 (photo render):
```jsx
layoutId={i === 0 && currentIdx === 0 ? `album-cover-${album.id}` : undefined}
```

This is **already guarded** by `currentIdx === 0`. But verify: is there any path where `currentIdx` becomes `0` during the exit animation (e.g., from the `snapAnimRef.onComplete` firing)? If yes, Framer Motion would re-activate the `layoutId` FLIP, which could cause a long-running animation that blocks layout.

### Suspect E — Framer Motion `AnimatePresence` exit not fully unmounting (Dashboard.jsx)

`Dashboard.jsx` wraps the gallery in `AnimatePresence`. After `setGalleryAlbum(null)`, React sets `galleryAlbum` to `null`, which signals `AnimatePresence` to run the exit animation. The body-lock `useEffect` in `Dashboard.jsx` runs **immediately** when `galleryAlbum` changes to `null` (because `useEffect` fires synchronously after render). But the gallery `motion.div` with `touch-action: none` remains mounted for 220 ms. 

**The question:** Are there 220 ms where the body's `overflow` is restored (`""`) but the gallery overlay with `touchAction: "none"` is still mounted, intercepting touches? Test this specific timing window.

---

## Key Code Locations

| Location | Description |
|---|---|
| `AlbumGallery.jsx` line ~619 | Comment: "Body scroll lock is now managed by Dashboard.jsx" — verify this is fully true |
| `AlbumGallery.jsx` line ~690 | `isDismissingRef.current = true` — set in dismiss branch |
| `AlbumGallery.jsx` line ~695 | `setSheetExpanded(false)` — must happen before `onClose()` |
| `AlbumGallery.jsx` line ~691-692 | `snapAnimRef.current?.stop()` and `dragYAnimRef.current?.stop()` |
| `AlbumGallery.jsx` line ~775-780 | Unmount cleanup `useEffect` — stops snap and dragY animations |
| `AlbumGallery.jsx` line ~895-900 | Root `motion.div` with `exit={{ pointerEvents: "none" }}` |
| `BottomSheet.jsx` line ~18-26 | Module-level `bodyLockHolders` — MUST be zero after gallery closes |
| `Dashboard.jsx` line ~120-133 | Body lock `useEffect` — MUST correctly restore `overflow: ""` |
| `Dashboard.jsx` line ~158-161 | `handleGalleryClose` — `dragProgressMV.set(1)` then `setGalleryAlbum(null)` |

---

## Critical Rules for Your Fix

1. **Do not** disable the Framer Motion `exit` animation — the shared element transition (FLIP from gallery photo back to album card) relies on it.
2. **Do not** remove the `layoutId` feature — the open animation uses it.
3. **Do not** refactor BottomSheet's body-lock mechanism unless it is provably the root cause.
4. **Preserve** all existing comments, especially the multi-line architectural explanations.
5. **One root cause, one fix** — if you apply multiple changes, explain why each was independently necessary.
6. After the fix, run the app (`npm run dev` is already running) and test **all 6 scenarios** listed in Step 5 before reporting success.
